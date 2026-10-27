import { z } from "zod";

const inspect = Symbol.for("nodejs.util.inspect.custom");

/** Wraps a secret so it cannot leak through logging, JSON, or string coercion (B7). */
export class Secret {
  readonly #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  reveal(): string {
    return this.#value;
  }
  toString() {
    return "[redacted]";
  }
  toJSON() {
    return "[redacted]";
  }
  [inspect]() {
    return "Secret([redacted])";
  }
}

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
  oauth: { google: OAuthClientConfig | null; github: OAuthClientConfig | null };
}

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_ORIGIN: z.url().default("http://localhost:3000"),
  API_PORT: z.coerce.number().int().positive().default(8787),
  DATABASE_URL: z.string().optional(),
  PGLITE_DIR: z.string().optional(),
  RUN_QUOTA_PER_MONTH: z.coerce.number().int().positive().optional(),
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

  return {
    env: env.NODE_ENV,
    appOrigin: origin,
    port: env.API_PORT,
    databaseUrl: env.DATABASE_URL ? new Secret(env.DATABASE_URL) : null,
    pgliteDir: env.DATABASE_URL ? null : (env.PGLITE_DIR ?? ".data/pglite"),
    secureCookies: origin.startsWith("https://"),
    runQuotaPerMonth: env.RUN_QUOTA_PER_MONTH ?? null,
    oauth: {
      google: oauthClient(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET),
      github: oauthClient(env.GITHUB_CLIENT_ID, env.GITHUB_CLIENT_SECRET),
    },
  };
}

export function callbackUrl(config: Pick<Config, "appOrigin">, provider: string): string {
  return `${config.appOrigin}/api/auth/${provider}/callback`;
}
