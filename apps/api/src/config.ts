import { z } from "zod";

import { Secret } from "@agentflow/models";

export { Secret };

export interface OAuthClientConfig {
  clientId: string;
  clientSecret: Secret;
}

export interface Config {
  env: "development" | "test" | "production";
  /** Public origin of the website. The browser only ever talks to this origin. */
  appOrigin: string;
  port: number;
  databaseUrl: Secret | null;
  pgliteDir: string | null;
  secureCookies: boolean;
  /** Optional monthly run limit per workspace for the quota hooks; null = unlimited. */
  runQuotaPerMonth: number | null;
  models: {
    /** Only providers approved by the owner (decision D2). Today: "mock". */
    provider: "mock";
    timeoutMs: number;
    maxAttempts: number;
    /** Optional monthly hosted-model token limit per workspace; null = unlimited. */
    tokensPerMonth: number | null;
    /** KEK for BYOK envelope encryption (base64, 32 bytes). Null disables BYOK. */
    byokKek: Secret | null;
    byokKekId: string;
  };
  oauth: { google: OAuthClientConfig | null; github: OAuthClientConfig | null };
}

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  RUN_QUOTA_PER_MONTH: z.coerce.number().int().positive().optional(),
  MODEL_PROVIDER: z.string().optional(),
  MODEL_TIMEOUT_MS: z.coerce.number().int().min(100).max(120_000).default(20_000),
  MODEL_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(5).default(3),
  MODEL_TOKENS_PER_MONTH: z.coerce.number().int().positive().optional(),
  BYOK_KEK: z.string().optional(),
  BYOK_KEK_ID: z
    .string()
    .regex(/^[a-z0-9-]{1,32}$/)
    .default("local-1"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

function oauthClient(id?: string, secret?: string): OAuthClientConfig | null {
  // A provider is enabled only when BOTH values are present. No fallback, no fake success.
  if (!id?.trim() || !secret?.trim()) return null;
  return { clientId: id.trim(), clientSecret: new Secret(secret.trim()) };
}

export function loadConfig(source: Record<string, string | undefined> = process.env): Config {
  const blank = (v: string | undefined) => (v === "" ? undefined : v);
  const env = Env.parse(Object.fromEntries(Object.entries(source).map(([k, v]) => [k, blank(v)])));
  const origin = new URL(env.APP_ORIGIN).origin;

  if (env.NODE_ENV === "production") {
    if (!origin.startsWith("https://")) throw new Error("APP_ORIGIN must use https in production");
    if (!env.DATABASE_URL)
      throw new Error("DATABASE_URL is required in production (embedded PGlite is dev-only)");
  }

  // Fail closed: no real provider runs until the owner approves one (D2) and adds an adapter.
  const provider = env.MODEL_PROVIDER ?? "mock";
  if (provider !== "mock") {
    throw new Error(
      `MODEL_PROVIDER "${provider}" is not approved (decision D2). Only "mock" is available.`,
    );
  }
  if (env.BYOK_KEK && Buffer.from(env.BYOK_KEK, "base64").length !== 32) {
    throw new Error("BYOK_KEK must be 32 bytes, base64-encoded");
  }

  return {
    env: env.NODE_ENV,
    appOrigin: origin,
    port: env.API_PORT,
    databaseUrl: env.DATABASE_URL ? new Secret(env.DATABASE_URL) : null,
    pgliteDir: env.DATABASE_URL ? null : (env.PGLITE_DIR ?? ".data/pglite"),
    secureCookies: origin.startsWith("https://"),
    runQuotaPerMonth: env.RUN_QUOTA_PER_MONTH ?? null,
    models: {
      provider,
      timeoutMs: env.MODEL_TIMEOUT_MS,
      maxAttempts: env.MODEL_MAX_ATTEMPTS,
      tokensPerMonth: env.MODEL_TOKENS_PER_MONTH ?? null,
      byokKek: env.BYOK_KEK ? new Secret(env.BYOK_KEK) : null,
      byokKekId: env.BYOK_KEK_ID,
    },
    oauth: {
      google: oauthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
      github: oauthClient(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
    },
  };
}

export function callbackUrl(config: Pick<Config, "appOrigin">, provider: string): string {
  return `${config.appOrigin}/api/auth/${provider}/callback`;
}
