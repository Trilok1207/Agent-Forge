import {
  MeResponse,
  ProvidersResponse,
  SessionsResponse,
  WorkspaceDetail,
} from "@agentflow/contracts";
import { eq, schema } from "@agentflow/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { safeNextPath } from "./auth/routes";
import { hashToken, SESSION_TTL_MS } from "./auth/session";
import { createProviders } from "./auth/providers";
import { loadConfig } from "./config";
import { cookiesFrom, get, ORIGIN, setup, signIn, type Harness } from "./test/harness";

let h: Harness;
beforeAll(async () => {
  h = await setup();
});
afterAll(() => h.handle.close());

describe("missing OAuth credentials", () => {
  it("builds no provider when either id or secret is missing", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      GOOGLE_CLIENT_ID: "id-only",
      GITHUB_CLIENT_SECRET: "secret-only",
    });
    const providers = createProviders(config);
    expect(providers.google).toBeUndefined();
    expect(providers.github).toBeUndefined();
  });

  it("start and callback refuse to sign in and never set a session", async () => {
    const bare = await setup({ providers: {} });
    try {
      for (const path of ["/auth/google/start", "/auth/github/callback?state=x&code=y"]) {
        const res = await bare.app.request(path);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=provider_not_configured`);
        expect(cookiesFrom(res).af_session).toBeUndefined();
      }
      const providers = ProvidersResponse.parse(
        await (await bare.app.request("/v1/auth/providers")).json(),
      );
      expect(providers.providers.every((p) => !p.configured)).toBe(true);
      expect(await bare.handle.db.select().from(schema.users)).toHaveLength(0);
    } finally {
      await bare.handle.close();
    }
  });

  it("provider status exposes no client ids or secrets", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      GOOGLE_CLIENT_ID: "gid-123",
      GOOGLE_CLIENT_SECRET: "gsecret-xyz",
    });
    const withReal = await setup({ providers: createProviders(config) });
    try {
      const text = await (await withReal.app.request("/v1/auth/providers")).text();
      expect(text).toContain('"configured":true');
      expect(text).not.toContain("gid-123");
      expect(text).not.toContain("gsecret-xyz");
      expect(JSON.stringify(config)).not.toContain("gsecret-xyz");
      expect(String(config.oauth.google!.clientSecret)).toBe("[redacted]");
    } finally {
      await withReal.handle.close();
    }
  });

  it("real Google start redirects to Google with PKCE and identity-only scopes", async () => {
    const config = loadConfig({
      NODE_ENV: "test",
      APP_ORIGIN: ORIGIN,
      GOOGLE_CLIENT_ID: "gid",
      GOOGLE_CLIENT_SECRET: "gs",
      GITHUB_CLIENT_ID: "hid",
      GITHUB_CLIENT_SECRET: "hs",
    });
    const real = await setup({ providers: createProviders(config) });
    try {
      const g = new URL((await real.app.request("/auth/google/start")).headers.get("location")!);
      expect(g.origin).toBe("https://accounts.google.com");
      expect(g.searchParams.get("code_challenge_method")).toBe("S256");
      expect(g.searchParams.get("redirect_uri")).toBe(`${ORIGIN}/api/auth/google/callback`);
      expect(g.searchParams.get("scope")).toBe("openid email profile");
      const gh = new URL((await real.app.request("/auth/github/start")).headers.get("location")!);
      expect(gh.origin).toBe("https://github.com");
      expect(gh.searchParams.get("scope")).toBe("read:user user:email");
      expect(gh.searchParams.get("scope")).not.toMatch(/repo/);
    } finally {
      await real.handle.close();
    }
  });
});

describe("OAuth callback", () => {
  it("first sign-in creates user, workspace, seeded demo project, and an HttpOnly session", async () => {
    const r = await signIn(h, h.google, {
      providerUserId: "g-ada",
      email: "Ada@Example.com",
      name: "Ada",
    });
    expect(r.location).toBe(`${ORIGIN}/workspace`);
    const setCookie = r.res.headers.getSetCookie().find((c) => c.startsWith("af_session="))!;
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/SameSite=Lax/);

    const me = MeResponse.parse(await (await get(h, "/v1/me", r.cookie)).json());
    expect(me.user.email).toBe("ada@example.com");
    expect(me.linkedProviders).toEqual(["google"]);
    expect(me.workspaces).toHaveLength(1);
    const ws = WorkspaceDetail.parse(
      await (await get(h, `/v1/workspaces/${me.workspaces[0]!.id}`, r.cookie)).json(),
    );
    expect(ws.projects).toEqual([expect.objectContaining({ isDemo: true, itemCount: 9 })]);
  });

  it("stores only a hash of the session token", async () => {
    const r = await signIn(h, h.google, { providerUserId: "g-hash", email: "hash@example.com" });
    const token = r.cookie!.split("=")[1]!;
    const rows = await h.handle.db.select().from(schema.sessions);
    expect(rows.some((s) => s.tokenHash === token)).toBe(false);
    expect(rows.some((s) => s.tokenHash === hashToken(token))).toBe(true);
  });

  it("rejects a mismatched state and creates no session", async () => {
    const start = await h.app.request("/auth/google/start");
    const flow = cookiesFrom(start).af_oauth;
    const code = h.google.issue({ providerUserId: "g-csrf", email: "csrf@example.com" });
    const res = await h.app.request(`/auth/google/callback?state=attacker&code=${code}`, {
      headers: { cookie: `af_oauth=${flow}` },
    });
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=oauth_state`);
    expect(cookiesFrom(res).af_session).toBeUndefined();
  });

  it("rejects a callback without the flow cookie (login CSRF)", async () => {
    const code = h.google.issue({ providerUserId: "g-nocookie", email: "nocookie@example.com" });
    const res = await h.app.request(`/auth/google/callback?state=s&code=${code}`);
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=oauth_state`);
  });

  it("rejects a flow cookie minted for another provider", async () => {
    const start = await h.app.request("/auth/github/start");
    const flow = cookiesFrom(start).af_oauth;
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    const code = h.google.issue({ providerUserId: "g-swap", email: "swap@example.com" });
    const res = await h.app.request(`/auth/google/callback?state=${state}&code=${code}`, {
      headers: { cookie: `af_oauth=${flow}` },
    });
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=oauth_state`);
  });

  it("maps provider exchange failures and denials to generic errors", async () => {
    const start = await h.app.request("/auth/google/start");
    const flow = cookiesFrom(start).af_oauth;
    const state = new URL(start.headers.get("location")!).searchParams.get("state");
    const bad = await h.app.request(`/auth/google/callback?state=${state}&code=forged`, {
      headers: { cookie: `af_oauth=${flow}` },
    });
    expect(bad.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=oauth_exchange`);
    const denied = await h.app.request(`/auth/google/callback?error=access_denied`);
    expect(denied.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=access_denied`);
  });

  it("refuses unverified emails", async () => {
    const r = await signIn(h, h.github, {
      providerUserId: "gh-unverified",
      email: "u@example.com",
      emailVerified: false,
    });
    expect(r.location).toBe(`${ORIGIN}/sign-in?error=email_unverified`);
    expect(r.cookie).toBeNull();
  });

  it("does not silently link a second provider with the same email", async () => {
    await signIn(h, h.google, { providerUserId: "g-grace", email: "grace@example.com" });
    const r = await signIn(h, h.github, { providerUserId: "gh-grace", email: "GRACE@example.com" });
    expect(r.location).toBe(`${ORIGIN}/sign-in?error=account_exists`);
    expect(r.cookie).toBeNull();
  });

  it("links a provider only through an explicit, signed-in link flow", async () => {
    const first = await signIn(h, h.google, {
      providerUserId: "g-linus",
      email: "linus@example.com",
    });
    const linked = await signIn(
      h,
      h.github,
      { providerUserId: "gh-linus", email: "other@example.com" },
      { cookie: first.cookie!, intent: "link" },
    );
    expect(linked.location).toBe(`${ORIGIN}/account`);
    const me = MeResponse.parse(await (await get(h, "/v1/me", linked.cookie)).json());
    expect(me.linkedProviders).toEqual(["github", "google"]);
    // The GitHub identity now signs in to the same user.
    const again = await signIn(h, h.github, {
      providerUserId: "gh-linus",
      email: "other@example.com",
    });
    expect(MeResponse.parse(await (await get(h, "/v1/me", again.cookie)).json()).user.id).toBe(
      me.user.id,
    );
  });

  it("link flow requires an existing session", async () => {
    const res = await h.app.request("/auth/github/link", {
      method: "POST",
      headers: { origin: ORIGIN },
    });
    expect(res.headers.get("location")).toBe(`${ORIGIN}/sign-in?error=signin_required`);
  });

  it("link flow cannot be started cross-site or via GET", async () => {
    const r = await signIn(h, h.google, {
      providerUserId: "g-forcelink",
      email: "forcelink@example.com",
    });
    const cross = await h.app.request("/auth/github/link", {
      method: "POST",
      headers: { cookie: r.cookie!, origin: "https://evil.example" },
    });
    expect(cross.status).toBe(403);
    // A GET start is always a plain sign-in, never a link, even when a session exists.
    const viaGet = await h.app.request("/auth/github/start?intent=link", {
      headers: { cookie: r.cookie! },
    });
    const flow = JSON.parse(Buffer.from(cookiesFrom(viaGet).af_oauth!, "base64url").toString());
    expect(flow.i).toBe("signin");
  });

  it("rotates the session on re-login and invalidates the old one", async () => {
    const a = await signIn(h, h.google, { providerUserId: "g-rot", email: "rot@example.com" });
    const b = await signIn(
      h,
      h.google,
      { providerUserId: "g-rot", email: "rot@example.com" },
      { cookie: a.cookie! },
    );
    expect(b.cookie).not.toBe(a.cookie);
    expect((await get(h, "/v1/me", a.cookie)).status).toBe(401);
    expect((await get(h, "/v1/me", b.cookie)).status).toBe(200);
  });

  it.each([
    ["//evil.example/x", "/workspace"],
    ["/\\evil.example", "/workspace"],
    ["https://evil.example", "/workspace"],
    ["/account?tab=sessions", "/account?tab=sessions"],
  ])("next=%s redirects to %s", async (next, expected) => {
    expect(safeNextPath(next)).toBe(expected);
    const r = await signIn(
      h,
      h.google,
      { providerUserId: `g-next-${expected}`, email: `next${Math.random()}@example.com` },
      { next },
    );
    expect(r.location).toBe(`${ORIGIN}${expected}`);
  });
});

describe("sessions", () => {
  it("unknown, malformed, and expired tokens are unauthenticated", async () => {
    expect((await get(h, "/v1/me", "af_session=" + "A".repeat(43))).status).toBe(401);
    expect((await get(h, "/v1/me", "af_session=not-a-token")).status).toBe(401);

    const r = await signIn(h, h.google, { providerUserId: "g-exp", email: "exp@example.com" });
    const hash = hashToken(r.cookie!.split("=")[1]!);
    await h.handle.db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.sessions.tokenHash, hash));
    expect((await get(h, "/v1/me", r.cookie)).status).toBe(401);
    expect(
      await h.handle.db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, hash)),
    ).toHaveLength(0);
  });

  it("renews sessions past half-life", async () => {
    const r = await signIn(h, h.google, { providerUserId: "g-renew", email: "renew@example.com" });
    const hash = hashToken(r.cookie!.split("=")[1]!);
    await h.handle.db
      .update(schema.sessions)
      .set({ expiresAt: new Date(Date.now() + 1000 * 60 * 60) })
      .where(eq(schema.sessions.tokenHash, hash));
    const res = await get(h, "/v1/me", r.cookie);
    expect(res.status).toBe(200);
    expect(cookiesFrom(res).af_session).toBe(r.cookie!.split("=")[1]);
    const [row] = await h.handle.db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.tokenHash, hash));
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + SESSION_TTL_MS - 60_000);
  });

  it("sign-out requires same-origin and invalidates the session", async () => {
    const r = await signIn(h, h.google, { providerUserId: "g-out", email: "out@example.com" });
    const forged = await h.app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie: r.cookie!, origin: "https://evil.example" },
    });
    expect(forged.status).toBe(403);
    const missing = await h.app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie: r.cookie! },
    });
    expect(missing.status).toBe(403);
    expect((await get(h, "/v1/me", r.cookie)).status).toBe(200);

    const ok = await h.app.request("/auth/sign-out", {
      method: "POST",
      headers: { cookie: r.cookie!, origin: ORIGIN },
    });
    expect(ok.status).toBe(303);
    expect(ok.headers.getSetCookie().some((c) => c.startsWith("af_session=;"))).toBe(true);
    expect((await get(h, "/v1/me", r.cookie)).status).toBe(401);
  });

  it("users can list and revoke their own sessions", async () => {
    const a = await signIn(h, h.google, { providerUserId: "g-multi", email: "multi@example.com" });
    const b = await signIn(h, h.google, { providerUserId: "g-multi", email: "multi@example.com" });
    const list = SessionsResponse.parse(await (await get(h, "/v1/me/sessions", b.cookie)).json());
    expect(list.sessions).toHaveLength(2);
    const other = list.sessions.find((s) => !s.current)!;
    const del = await h.app.request(`/v1/me/sessions/${other.id}`, {
      method: "DELETE",
      headers: { cookie: b.cookie!, origin: ORIGIN },
    });
    expect(del.status).toBe(204);
    expect((await get(h, "/v1/me", a.cookie)).status).toBe(401);
    expect((await get(h, "/v1/me", b.cookie)).status).toBe(200);
  });

  it("authenticated responses are not cacheable", async () => {
    const r = await signIn(h, h.google, { providerUserId: "g-cache", email: "cache@example.com" });
    expect((await get(h, "/v1/me", r.cookie)).headers.get("cache-control")).toBe("no-store");
  });

  it("uses __Host- Secure cookies when the app origin is https", async () => {
    const secure = await setup({ env: { APP_ORIGIN: "https://app.example" } });
    try {
      const start = await secure.app.request("/auth/google/start");
      const c = start.headers.getSetCookie()[0]!;
      expect(c).toMatch(/^__Host-af_oauth=/);
      expect(c).toMatch(/Secure/);
    } finally {
      await secure.handle.close();
    }
  });
});

describe("audit", () => {
  it("records sign-in events without tokens", async () => {
    const r = await signIn(h, h.github, { providerUserId: "gh-audit", email: "audit@example.com" });
    const body = await (await get(h, "/v1/me/audit", r.cookie)).text();
    expect(body).toContain("auth.sign_in");
    expect(body).toContain("user.created");
    expect(body).not.toContain(r.cookie!.split("=")[1]!);
  });
});
