import type { AuthProviderId } from "@agentflow/contracts";
import { decodeIdToken, GitHub, Google } from "arctic";
import { callbackUrl, type Config } from "../config";

export interface ProviderProfile {
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  avatarUrl: string | null;
}

export interface OAuthProvider {
  id: AuthProviderId;
  authorizationUrl(state: string, codeVerifier: string): URL;
  /** Exchanges the code with the provider and returns the verified profile. Throws on any failure. */
  exchange(code: string, codeVerifier: string): Promise<ProviderProfile>;
}

export type ProviderRegistry = Partial<Record<AuthProviderId, OAuthProvider>>;

/** Identity scopes only. GitHub sign-in never requests repository access (ADR-012). */
const GOOGLE_SCOPES = ["openid", "email", "profile"];
const GITHUB_SCOPES = ["read:user", "user:email"];

function googleProvider(config: Config): OAuthProvider | undefined {
  const c = config.oauth.google;
  if (!c) return undefined;
  const client = new Google(c.clientId, c.clientSecret.reveal(), callbackUrl(config, "google"));
  return {
    id: "google",
    authorizationUrl: (state, verifier) =>
      client.createAuthorizationURL(state, verifier, GOOGLE_SCOPES),
    async exchange(code, verifier) {
      const tokens = await client.validateAuthorizationCode(code, verifier);
      // The ID token came straight from Google's token endpoint over TLS, so its claims are trusted (OIDC §3.1.3.7).
      const claims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
      if (typeof claims.sub !== "string" || typeof claims.email !== "string")
        throw new Error("google: missing claims");
      return {
        providerUserId: claims.sub,
        email: claims.email,
        emailVerified: claims.email_verified === true,
        name: typeof claims.name === "string" ? claims.name : null,
        avatarUrl: typeof claims.picture === "string" ? claims.picture : null,
      };
    },
  };
}

function githubProvider(config: Config, fetchImpl: typeof fetch): OAuthProvider | undefined {
  const c = config.oauth.github;
  if (!c) return undefined;
  const client = new GitHub(c.clientId, c.clientSecret.reveal(), callbackUrl(config, "github"));
  return {
    id: "github",
    authorizationUrl: (state) => client.createAuthorizationURL(state, GITHUB_SCOPES),
    async exchange(code) {
      const tokens = await client.validateAuthorizationCode(code);
      const headers = {
        Authorization: `Bearer ${tokens.accessToken()}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "AgentFlow",
      };
      const [userRes, emailsRes] = await Promise.all([
        fetchImpl("https://api.github.com/user", { headers }),
        fetchImpl("https://api.github.com/user/emails", { headers }),
      ]);
      if (!userRes.ok || !emailsRes.ok) throw new Error("github: profile request failed");
      const user = (await userRes.json()) as {
        id: number;
        name: string | null;
        login: string;
        avatar_url: string | null;
      };
      const emails = (await emailsRes.json()) as {
        email: string;
        primary: boolean;
        verified: boolean;
      }[];
      const primary = emails.find((e) => e.primary && e.verified) ?? emails.find((e) => e.primary);
      if (!primary) throw new Error("github: no primary email");
      return {
        providerUserId: String(user.id),
        email: primary.email,
        emailVerified: primary.verified,
        name: user.name ?? user.login,
        avatarUrl: user.avatar_url,
      };
    },
  };
}

/** Real providers, present only when fully configured. */
export function createProviders(config: Config, fetchImpl: typeof fetch = fetch): ProviderRegistry {
  return { google: googleProvider(config), github: githubProvider(config, fetchImpl) };
}
