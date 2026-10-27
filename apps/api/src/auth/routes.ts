import { timingSafeEqual } from "node:crypto";
import { AuthProviderId, type ProvidersResponse, type SignInErrorCode } from "@agentflow/contracts";
import { and, eq, schema, seedDemoProject } from "@agentflow/db";
import { generateCodeVerifier, generateState } from "arctic";
import { Hono, type Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { audit } from "../audit";
import type { AppEnv, Deps } from "../context";
import { requireSameOrigin } from "../middleware";
import type { ProviderProfile } from "./providers";
import {
  clearSessionCookie,
  cookieNames,
  cookieOptions,
  createSession,
  deleteSession,
  setSessionCookie,
} from "./session";

const OAUTH_COOKIE_MAX_AGE = 10 * 60;
const DEFAULT_NEXT = "/workspace";

interface OAuthFlow {
  p: AuthProviderId;
  s: string; // state
  v: string; // PKCE verifier
  n: string; // safe post-login path
  i: "signin" | "link";
}

/** Only same-site relative paths. Blocks open redirects such as `//evil.example` or `/\evil`. */
export function safeNextPath(next: string | undefined): string {
  if (!next || next.length > 512) return DEFAULT_NEXT;
  if (!next.startsWith("/") || next.startsWith("//") || next.includes("\\")) return DEFAULT_NEXT;
  if ([...next].some((ch) => ch.charCodeAt(0) < 0x20)) return DEFAULT_NEXT;
  return next;
}

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

function readFlow(raw: string | undefined): OAuthFlow | null {
  if (!raw) return null;
  try {
    const f = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as OAuthFlow;
    if (
      !AuthProviderId.safeParse(f.p).success ||
      typeof f.s !== "string" ||
      typeof f.v !== "string"
    )
      return null;
    return { ...f, n: safeNextPath(f.n), i: f.i === "link" ? "link" : "signin" };
  } catch {
    return null;
  }
}

type Outcome = { ok: true; userId: string } | { ok: false; error: SignInErrorCode };

export function authRoutes(deps: Deps) {
  const { db, config, providers } = deps;
  const app = new Hono<AppEnv>();
  const names = cookieNames(config);
  const toSignIn = (error: SignInErrorCode) => `${config.appOrigin}/sign-in?error=${error}`;

  app.get("/v1/auth/providers", (c) =>
    c.json<ProvidersResponse>({
      providers: AuthProviderId.options.map((id) => ({ id, configured: Boolean(providers[id]) })),
    }),
  );

  /** Begins an OAuth flow: one-shot flow cookie, then redirect to the provider. */
  function beginFlow(c: Context<AppEnv>, intent: OAuthFlow["i"]) {
    const id = AuthProviderId.safeParse(c.req.param("provider"));
    if (!id.success) return c.notFound();
    const provider = providers[id.data];
    // Missing credentials never produce a session: send the user back with an explanation.
    if (!provider)
      return c.redirect(toSignIn("provider_not_configured"), intent === "link" ? 303 : 302);
    if (intent === "link" && !c.get("auth")) return c.redirect(toSignIn("signin_required"), 303);

    const flow: OAuthFlow = {
      p: id.data,
      s: generateState(),
      v: generateCodeVerifier(),
      n: intent === "link" ? "/account" : safeNextPath(c.req.query("next")),
      i: intent,
    };
    setCookie(
      c,
      names.oauth,
      Buffer.from(JSON.stringify(flow)).toString("base64url"),
      cookieOptions(config, OAUTH_COOKIE_MAX_AGE),
    );
    return c.redirect(
      provider.authorizationUrl(flow.s, flow.v).toString(),
      intent === "link" ? 303 : 302,
    );
  }

  app.get("/auth/:provider/start", (c) => beginFlow(c, "signin"));

  // Linking changes an existing account, so it must start from a same-origin POST
  // (a cross-site GET navigation would carry the Lax session cookie).
  app.post("/auth/:provider/link", requireSameOrigin(deps), (c) => beginFlow(c, "link"));

  app.get("/auth/:provider/callback", async (c) => {
    const id = AuthProviderId.safeParse(c.req.param("provider"));
    if (!id.success) return c.notFound();
    const provider = providers[id.data];
    if (!provider) return c.redirect(toSignIn("provider_not_configured"), 302);

    // One-shot: the flow cookie is consumed whatever happens next.
    const flow = readFlow(getCookie(c, names.oauth));
    deleteCookie(c, names.oauth, { path: "/", secure: config.secureCookies });

    if (c.req.query("error")) return c.redirect(toSignIn("access_denied"), 302);
    const state = c.req.query("state");
    const code = c.req.query("code");
    if (!flow || flow.p !== id.data || !state || !code || !safeEqual(state, flow.s)) {
      return c.redirect(toSignIn("oauth_state"), 302);
    }

    let profile: ProviderProfile;
    try {
      profile = await provider.exchange(code, flow.v);
    } catch {
      // Provider error details may echo codes or tokens; don't log or return them.
      return c.redirect(toSignIn("oauth_exchange"), 302);
    }
    if (!profile.emailVerified) return c.redirect(toSignIn("email_unverified"), 302);

    const current = c.get("auth");
    const outcome = await resolveUser(
      deps,
      id.data,
      profile,
      flow.i === "link" ? (current?.user.id ?? null) : null,
    );
    if (!outcome.ok) return c.redirect(toSignIn(outcome.error), 302);

    // Session rotation: any previous session on this browser is replaced.
    if (current) await deleteSession(db, current.sessionId);
    const session = await createSession(db, outcome.userId, c.req.header("user-agent") ?? null);
    setSessionCookie(c, config, session.token, session.expiresAt);
    await audit(db, {
      actorUserId: outcome.userId,
      action: "auth.sign_in",
      detail: { provider: id.data },
    });
    return c.redirect(`${config.appOrigin}${flow.n}`, 302);
  });

  app.post("/auth/sign-out", requireSameOrigin(deps), async (c) => {
    const auth = c.get("auth");
    if (auth) {
      await deleteSession(db, auth.sessionId);
      await audit(db, { actorUserId: auth.user.id, action: "auth.sign_out" });
    }
    clearSessionCookie(c, config);
    return c.redirect(`${config.appOrigin}/`, 303);
  });

  return app;
}

/**
 * Maps a verified provider identity to a user.
 * - Known provider account → that user.
 * - Explicit link while signed in → attach to the current user.
 * - Unknown account whose email belongs to an existing user → refuse (no silent account linking).
 * - Otherwise → new user, personal workspace, and the seeded demo project.
 */
async function resolveUser(
  { db }: Deps,
  provider: AuthProviderId,
  profile: ProviderProfile,
  linkToUserId: string | null,
): Promise<Outcome> {
  const email = profile.email.trim().toLowerCase();
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ userId: schema.oauthAccounts.userId })
      .from(schema.oauthAccounts)
      .where(
        and(
          eq(schema.oauthAccounts.provider, provider),
          eq(schema.oauthAccounts.providerUserId, profile.providerUserId),
        ),
      );

    if (linkToUserId) {
      if (existing && existing.userId !== linkToUserId)
        return { ok: false, error: "account_linked_elsewhere" } as const;
      if (!existing) {
        await tx
          .insert(schema.oauthAccounts)
          .values({ provider, providerUserId: profile.providerUserId, userId: linkToUserId });
        await audit(tx, {
          actorUserId: linkToUserId,
          action: "auth.provider_linked",
          detail: { provider },
        });
      }
      return { ok: true, userId: linkToUserId } as const;
    }

    if (existing) return { ok: true, userId: existing.userId } as const;

    const [byEmail] = await tx
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.email, email));
    if (byEmail) return { ok: false, error: "account_exists" } as const;

    const [user] = await tx
      .insert(schema.users)
      .values({ email, name: profile.name, avatarUrl: profile.avatarUrl })
      .returning({ id: schema.users.id });
    const userId = user!.id;
    await tx
      .insert(schema.oauthAccounts)
      .values({ provider, providerUserId: profile.providerUserId, userId });
    const [ws] = await tx
      .insert(schema.workspaces)
      .values({
        name: profile.name ? `${profile.name}'s workspace` : "My workspace",
        ownerUserId: userId,
      })
      .returning({ id: schema.workspaces.id });
    await tx.insert(schema.workspaceMembers).values({ workspaceId: ws!.id, userId, role: "owner" });
    await seedDemoProject(tx, ws!.id);
    await audit(tx, { actorUserId: userId, action: "user.created", detail: { provider } });
    await audit(tx, {
      actorUserId: userId,
      workspaceId: ws!.id,
      action: "workspace.created",
      detail: { demoSeeded: true },
    });
    return { ok: true, userId } as const;
  });
}
