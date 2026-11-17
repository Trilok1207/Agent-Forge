import { redact, type Secret } from "./secret";
import {
  ModelError,
  type ModelMode,
  type ModelProvider,
  type ModelRequest,
  type ModelResponse,
} from "./types";

export interface GatewayLimits {
  /** Max characters across system + messages. Checked before any reservation or call. */
  maxInputChars: number;
  /** Hard cap on requested output tokens (requests above are clamped). */
  maxOutputTokens: number;
  /** Max characters accepted back from a provider. */
  maxOutputChars: number;
  /** Per-attempt timeout. */
  timeoutMs: number;
  /** Total attempts including the first (bounded retries). */
  maxAttempts: number;
  baseBackoffMs: number;
}

export const DEFAULT_LIMITS: GatewayLimits = {
  maxInputChars: 24_000,
  maxOutputTokens: 2_000,
  maxOutputChars: 16_000,
  timeoutMs: 20_000,
  maxAttempts: 3,
  baseBackoffMs: 250,
};

/** Hosted-mode token budget (quota hook). BYOK calls are metered but not budgeted (ADR-010). */
export interface TokenBudget {
  reserve(args: {
    workspaceId: string;
    userId: string;
    tokens: number;
  }): Promise<{ ok: true; id: string } | { ok: false }>;
  settle(
    id: string,
    usage: { inputTokens: number; outputTokens: number; attempts: number },
  ): Promise<void>;
  release(id: string): Promise<void>;
}

/** Resolves the key for a call: platform key (hosted) or the workspace's own key (BYOK). Server-side only. */
export interface CredentialResolver {
  resolve(args: {
    workspaceId: string;
    providerId: string;
    mode: ModelMode;
  }): Promise<Secret | null>;
}

/** Structured, content-free logging. Never pass prompts, outputs, or keys. */
export type GatewayLog = (event: string, fields: Record<string, string | number | boolean>) => void;

export interface GatewayDeps {
  providers: Readonly<Record<string, ModelProvider>>;
  credentials: CredentialResolver;
  budget: TokenBudget;
  limits?: Partial<GatewayLimits>;
  log?: GatewayLog;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

export interface GenerateArgs {
  workspaceId: string;
  userId: string;
  providerId: string;
  mode: ModelMode;
  request: ModelRequest;
}

export interface GenerateResult {
  response: ModelResponse;
  attempts: number;
}

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

const SAFE_MESSAGES: Record<ModelError["kind"], string> = {
  timeout: "The model did not respond in time",
  rate_limited: "The model provider is rate limiting requests",
  unavailable: "The model provider is unavailable",
  auth: "The model provider rejected the credentials",
  bad_request: "The model provider rejected the request",
  invalid_response: "The model returned an invalid response",
  input_too_large: "Input is too large",
  output_too_large: "Model output exceeded the allowed size",
  quota_exceeded: "Model token quota reached for this workspace",
  not_configured: "No model credentials are configured for this mode",
};

/**
 * The only path to a model. Enforces input/output limits, the token budget,
 * per-attempt timeouts, and bounded retries with backoff. Every error is
 * normalised to a ModelError with a fixed, content-free message; provider
 * error text is redacted and only logged as a kind.
 */
export function createModelGateway(deps: GatewayDeps) {
  const limits: GatewayLimits = { ...DEFAULT_LIMITS, ...deps.limits };
  const log: GatewayLog = deps.log ?? (() => undefined);
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const random = deps.random ?? Math.random;
  const fail = (kind: ModelError["kind"]) => new ModelError(kind, SAFE_MESSAGES[kind]);

  async function callOnce(
    provider: ModelProvider,
    request: ModelRequest,
    credential: Secret | null,
  ): Promise<ModelResponse> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Race against the timer so a provider that ignores the abort signal still times out.
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        controller.abort();
        reject(fail("timeout"));
      }, limits.timeoutMs);
    });
    try {
      return await Promise.race([
        provider.generate(request, { signal: controller.signal, credential }),
        timeout,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    limits,
    async generate(args: GenerateArgs): Promise<GenerateResult> {
      const provider = deps.providers[args.providerId];
      if (
        !provider ||
        (args.mode === "hosted" && !provider.supportsHosted) ||
        (args.mode === "byok" && !provider.supportsByok)
      ) {
        throw fail("not_configured");
      }
      const inputChars =
        args.request.system.length +
        args.request.messages.reduce((n, m) => n + m.content.length, 0);
      if (inputChars > limits.maxInputChars) throw fail("input_too_large");
      const request: ModelRequest = {
        ...args.request,
        maxOutputTokens: Math.min(args.request.maxOutputTokens, limits.maxOutputTokens),
      };

      const credential = await deps.credentials.resolve({
        workspaceId: args.workspaceId,
        providerId: provider.id,
        mode: args.mode,
      });
      if (credential === null && provider.requiresCredential) throw fail("not_configured");

      let reservation: string | null = null;
      if (args.mode === "hosted") {
        const r = await deps.budget.reserve({
          workspaceId: args.workspaceId,
          userId: args.userId,
          tokens: estimateTokens("x".repeat(inputChars)) + request.maxOutputTokens,
        });
        if (!r.ok) throw fail("quota_exceeded");
        reservation = r.id;
      }

      let attempt = 0;
      let lastKind: ModelError["kind"] = "unavailable";
      try {
        while (attempt < limits.maxAttempts) {
          attempt++;
          try {
            const response = await callOnce(provider, request, credential);
            if (typeof response?.text !== "string") throw fail("invalid_response");
            if (response.text.length > limits.maxOutputChars) throw fail("output_too_large");
            const usage = {
              inputTokens: nonNegInt(
                response.usage?.inputTokens,
                estimateTokens("x".repeat(inputChars)),
              ),
              outputTokens: nonNegInt(response.usage?.outputTokens, estimateTokens(response.text)),
            };
            if (reservation) await deps.budget.settle(reservation, { ...usage, attempts: attempt });
            reservation = null;
            log("model.call", {
              provider: provider.id,
              mode: args.mode,
              purpose: request.purpose,
              outcome: "ok",
              attempts: attempt,
              ...usage,
            });
            return { response: { ...response, usage }, attempts: attempt };
          } catch (e) {
            const err = normalise(e, credential);
            lastKind = err.kind;
            log("model.attempt_failed", {
              provider: provider.id,
              mode: args.mode,
              attempt,
              kind: err.kind,
              detail: err.detail,
            });
            if (!err.retryable || attempt >= limits.maxAttempts) break;
            const backoff = limits.baseBackoffMs * 2 ** (attempt - 1) * (0.5 + random() / 2);
            await sleep(backoff);
          }
        }
        log("model.call", {
          provider: provider.id,
          mode: args.mode,
          purpose: request.purpose,
          outcome: lastKind,
          attempts: attempt,
        });
        throw fail(lastKind);
      } finally {
        if (reservation) await deps.budget.release(reservation);
      }
    },
  };
}

export type ModelGateway = ReturnType<typeof createModelGateway>;

function nonNegInt(v: unknown, fallback: number) {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : fallback;
}

/** Maps anything thrown by a provider to a kind plus a short redacted detail (for logs only). */
function normalise(
  e: unknown,
  credential: Secret | null,
): { kind: ModelError["kind"]; retryable: boolean; detail: string } {
  const raw = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  const detail = redact(raw, [credential]).slice(0, 160);
  if (e instanceof ModelError) return { kind: e.kind, retryable: e.retryable, detail };
  if (e instanceof Error && e.name === "AbortError")
    return { kind: "timeout", retryable: true, detail };
  return { kind: "unavailable", retryable: true, detail };
}
