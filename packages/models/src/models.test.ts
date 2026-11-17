import { randomBytes } from "node:crypto";
import { inspect } from "node:util";
import { describe, expect, it } from "vitest";
import { createModelGateway, type GatewayDeps, type TokenBudget } from "./gateway";
import { createHangingProvider, createMockProvider } from "./mock";
import { redact, Secret } from "./secret";
import { ModelError, type ModelProvider, type ModelRequest } from "./types";
import { createKeyVault, KeyVaultError } from "./vault";

// Assembled at runtime so the repo secret scanner does not flag a test canary.
const KEY = "sk-" + "ant-api03-THIS-IS-A-CANARY-KEY-0123456789abcdef";

const request = (content = "Summarize my files"): ModelRequest => ({
  purpose: "plan",
  system: "You are a planner.",
  messages: [{ role: "user", content }],
  maxOutputTokens: 500,
  responseFormat: "json",
});

function ledger() {
  const events: string[] = [];
  let n = 0;
  const budget: TokenBudget & { events: string[]; deny: boolean } = {
    events,
    deny: false,
    async reserve({ tokens }) {
      if (budget.deny) {
        events.push("deny");
        return { ok: false };
      }
      events.push(`reserve:${tokens}`);
      return { ok: true, id: `r${++n}` };
    },
    async settle(id, u) {
      events.push(`settle:${id}:${u.inputTokens}+${u.outputTokens}:${u.attempts}`);
    },
    async release(id) {
      events.push(`release:${id}`);
    },
  };
  return budget;
}

function gateway(provider: ModelProvider, extra: Partial<GatewayDeps> = {}) {
  const logs: string[] = [];
  const sleeps: number[] = [];
  const budget = ledger();
  const gw = createModelGateway({
    providers: { [provider.id]: provider },
    credentials: { resolve: async () => (provider.requiresCredential ? new Secret(KEY) : null) },
    budget,
    log: (event, fields) => logs.push(`${event} ${JSON.stringify(fields)}`),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    random: () => 0.5,
    ...extra,
  });
  return { gw, logs, sleeps, budget };
}

const call = (
  gw: ReturnType<typeof createModelGateway>,
  mode: "hosted" | "byok" = "hosted",
  content?: string,
) =>
  gw.generate({
    workspaceId: "w1",
    userId: "u1",
    providerId: "mock",
    mode,
    request: request(content),
  });

/** A provider that needs a key and echoes it in its error, like a careless SDK. */
const leakyProvider = (kind: ModelError["kind"] | "raw"): ModelProvider => ({
  id: "mock",
  supportsByok: true,
  supportsHosted: true,
  requiresCredential: true,
  async generate(_req, ctx) {
    const msg = `401 Unauthorized: invalid x-api-key ${ctx.credential!.reveal()} (Authorization: Bearer ${ctx.credential!.reveal()})`;
    if (kind === "raw") throw new Error(msg);
    throw new ModelError(kind, msg);
  },
});

describe("gateway: success path", () => {
  it("returns the response, settles actual usage, and logs no content", async () => {
    const p = createMockProvider({ respond: () => '{"ok":true}' });
    const { gw, logs, budget } = gateway(p);
    const r = await call(gw, "hosted", "PRIVATE-REQUEST-TEXT");
    expect(r.response.text).toBe('{"ok":true}');
    expect(r.attempts).toBe(1);
    expect(budget.events[0]).toMatch(/^reserve:/);
    expect(budget.events[1]).toMatch(/^settle:r1:\d+\+\d+:1$/);
    expect(logs.join("\n")).not.toContain("PRIVATE-REQUEST-TEXT");
    expect(logs.join("\n")).not.toContain('{"ok":true}');
  });

  it("clamps requested output tokens to the limit", async () => {
    const p = createMockProvider({ respond: () => "x" });
    const { gw } = gateway(p, { limits: { maxOutputTokens: 100 } });
    await gw.generate({
      workspaceId: "w",
      userId: "u",
      providerId: "mock",
      mode: "hosted",
      request: { ...request(), maxOutputTokens: 99_999 },
    });
    expect(p.calls[0]!.maxOutputTokens).toBe(100);
  });

  it("never sends tools: the request type has no tool field", async () => {
    const p = createMockProvider({ respond: () => "x" });
    const { gw } = gateway(p);
    await call(gw);
    expect(Object.keys(p.calls[0]!).sort()).toEqual([
      "maxOutputTokens",
      "messages",
      "purpose",
      "responseFormat",
      "system",
    ]);
  });
});

describe("gateway: limits and quota", () => {
  it("rejects oversized input before reserving or calling", async () => {
    const p = createMockProvider({ respond: () => "x" });
    const { gw, budget } = gateway(p, { limits: { maxInputChars: 50 } });
    await expect(call(gw, "hosted", "y".repeat(100))).rejects.toMatchObject({
      kind: "input_too_large",
    });
    expect(p.calls).toHaveLength(0);
    expect(budget.events).toEqual([]);
  });

  it("rejects oversized output and releases the reservation", async () => {
    const p = createMockProvider({ respond: () => "z".repeat(500) });
    const { gw, budget } = gateway(p, { limits: { maxOutputChars: 100 } });
    await expect(call(gw)).rejects.toMatchObject({ kind: "output_too_large" });
    expect(p.calls).toHaveLength(1);
    expect(budget.events).toEqual([expect.stringMatching(/^reserve:/), "release:r1"]);
  });

  it("quota denial stops the call before the provider is reached", async () => {
    const p = createMockProvider({ respond: () => "x" });
    const { gw, budget } = gateway(p);
    budget.deny = true;
    await expect(call(gw)).rejects.toMatchObject({
      kind: "quota_exceeded",
      message: "Model token quota reached for this workspace",
    });
    expect(p.calls).toHaveLength(0);
  });

  it("BYOK calls are not budgeted, and providers without BYOK support refuse BYOK mode", async () => {
    const byok = createMockProvider({ respond: () => "x", supportsByok: true });
    const { gw, budget } = gateway(byok);
    await call(gw, "byok");
    expect(budget.events).toEqual([]);
    const noByok = createMockProvider({ respond: () => "x" });
    await expect(call(gateway(noByok).gw, "byok")).rejects.toMatchObject({
      kind: "not_configured",
    });
  });

  it("a provider that needs a key fails closed when none resolves", async () => {
    const real: ModelProvider = {
      ...leakyProvider("auth"),
      generate: async () => ({
        text: "x",
        usage: { inputTokens: 1, outputTokens: 1 },
        model: "m",
        finishReason: "stop",
      }),
    };
    const gw = createModelGateway({
      providers: { mock: real },
      credentials: { resolve: async () => null },
      budget: ledger(),
    });
    await expect(call(gw)).rejects.toMatchObject({ kind: "not_configured" });
    await expect(
      gw.generate({
        workspaceId: "w",
        userId: "u",
        providerId: "nope",
        mode: "hosted",
        request: request(),
      }),
    ).rejects.toMatchObject({ kind: "not_configured" });
  });
});

describe("gateway: outages, timeouts, retries", () => {
  it("retries retryable failures with bounded exponential backoff, then fails", async () => {
    const p = createMockProvider({
      respond: () => {
        throw new ModelError("unavailable", "503 upstream");
      },
    });
    const { gw, sleeps, budget } = gateway(p, { limits: { maxAttempts: 3, baseBackoffMs: 100 } });
    await expect(call(gw)).rejects.toMatchObject({
      kind: "unavailable",
      message: "The model provider is unavailable",
    });
    expect(p.calls).toHaveLength(3);
    expect(sleeps).toEqual([75, 150]);
    expect(budget.events.at(-1)).toBe("release:r1");
  });

  it("recovers when a later attempt succeeds and records the attempt count", async () => {
    const p = createMockProvider({
      respond: (_r, attempt) => {
        if (attempt < 3) throw new ModelError("rate_limited", "429");
        return "ok";
      },
    });
    const { gw, budget } = gateway(p);
    const r = await call(gw);
    expect(r.attempts).toBe(3);
    expect(budget.events.at(-1)).toMatch(/:3$/);
  });

  it("does not retry non-retryable errors", async () => {
    const p = createMockProvider({
      respond: () => {
        throw new ModelError("bad_request", "400");
      },
    });
    const { gw } = gateway(p);
    await expect(call(gw)).rejects.toMatchObject({ kind: "bad_request" });
    expect(p.calls).toHaveLength(1);
  });

  it("times out a provider that never answers, per attempt", async () => {
    const { gw, logs } = gateway(createHangingProvider(), {
      limits: { timeoutMs: 20, maxAttempts: 2 },
    });
    const started = Date.now();
    await expect(call(gw)).rejects.toMatchObject({ kind: "timeout" });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(logs.filter((l) => l.startsWith("model.attempt_failed"))).toHaveLength(2);
  });

  it("unknown provider exceptions become a generic 'unavailable'", async () => {
    const p = createMockProvider({
      respond: () => {
        throw new TypeError("Cannot read properties of undefined");
      },
    });
    const { gw } = gateway(p, { limits: { maxAttempts: 1 } });
    await expect(call(gw)).rejects.toMatchObject({ kind: "unavailable" });
  });
});

describe("secret redaction (B7)", () => {
  it.each(["auth", "raw"] as const)(
    "provider errors echoing the key never leak (%s)",
    async (kind) => {
      const { gw, logs } = gateway(leakyProvider(kind), { limits: { maxAttempts: 2 } });
      const err = (await call(gw).catch((e: unknown) => e)) as ModelError;
      expect(err).toBeInstanceOf(ModelError);
      const surfaces = [
        err.message,
        String(err),
        JSON.stringify(err),
        inspect(err),
        logs.join("\n"),
      ].join("\n");
      expect(surfaces).not.toContain(KEY);
      expect(surfaces).not.toContain("CANARY");
      expect(logs.join("\n")).toContain("[redacted]");
    },
  );

  it("redact() removes known values and credential-shaped strings", () => {
    const s = new Secret("my-very-secret-value");
    const out = redact(
      `key=my-very-secret-value; Authorization: Bearer abc.def.ghijklmnop; api_key: "zzzzzzzzzzzz"; sk-proj-${"a".repeat(30)}; AIza${"b".repeat(35)}`,
      [s],
    );
    expect(out).not.toMatch(/my-very-secret-value|abc\.def|zzzzzzzzzzzz|sk-proj-a|AIzab/);
  });

  it("Secret never serialises its value", () => {
    const s = new Secret(KEY);
    expect([String(s), JSON.stringify({ s }), inspect(s), `${s}`].join(" ")).not.toContain(KEY);
  });
});

describe("key vault (envelope encryption)", () => {
  const kek = new Secret(randomBytes(32).toString("base64"));

  it("round-trips, stores no plaintext, and binds ciphertext to its workspace/provider", () => {
    const vault = createKeyVault({ kek, kekId: "local-1" });
    const enc = vault.encrypt(new Secret(KEY), "w1:openai");
    expect(JSON.stringify(enc)).not.toContain(KEY);
    expect(vault.decrypt(enc, "w1:openai").reveal()).toBe(KEY);
    expect(() => vault.decrypt(enc, "w2:openai")).toThrow(KeyVaultError);
    const tampered = { ...enc, ciphertext: Buffer.from("x".repeat(40)).toString("base64") };
    expect(() => vault.decrypt(tampered, "w1:openai")).toThrow(KeyVaultError);
  });

  it("a different KEK cannot decrypt, and short KEKs are rejected", () => {
    const enc = createKeyVault({ kek, kekId: "local-1" }).encrypt(new Secret(KEY), "w1:p");
    const other = createKeyVault({
      kek: new Secret(randomBytes(32).toString("base64")),
      kekId: "local-1",
    });
    expect(() => other.decrypt(enc, "w1:p")).toThrow(KeyVaultError);
    expect(() =>
      createKeyVault({ kek: new Secret(randomBytes(16).toString("base64")), kekId: "x" }),
    ).toThrow(KeyVaultError);
  });
});
