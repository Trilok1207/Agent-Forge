import { randomUUID } from "node:crypto";
import { createDb, type DbHandle } from "@agentflow/db";
import pg from "pg";
import { createApp } from "../app";
import type { OAuthProvider, ProviderProfile, ProviderRegistry } from "../auth/providers";
import { loadConfig } from "../config";
import { ledgerQuota, type QuotaHooks } from "../quota";
import { createMockExecutor, type StepExecutor } from "@agentflow/workflow";

export const ORIGIN = "http://localhost:3000";

/**
 * Test-only identity provider. It lives in test code and is injected through
 * createApp's deps; the running server only ever builds real providers.
 */
export class TestIdp implements OAuthProvider {
  readonly codes = new Map<string, ProviderProfile>();
  constructor(readonly id: "google" | "github") {}
  authorizationUrl(state: string) {
    return new URL(`https://idp.test/${this.id}/authorize?state=${state}`);
  }
  async exchange(code: string) {
    const p = this.codes.get(code);
    if (!p) throw new Error("invalid_grant");
    return p;
  }
  issue(profile: Partial<ProviderProfile> & { providerUserId: string; email: string }) {
    const code = `code-${Math.random().toString(36).slice(2)}`;
    this.codes.set(code, { emailVerified: true, name: null, avatarUrl: null, ...profile });
    return code;
  }
}

export async function setup(
  opts: {
    providers?: ProviderRegistry;
    env?: Record<string, string>;
    quota?: QuotaHooks;
    executor?: StepExecutor;
  } = {},
) {
  const handle = await freshDb();
  await handle.migrate();
  const config = loadConfig({ NODE_ENV: "test", APP_ORIGIN: ORIGIN, ...opts.env });
  const google = new TestIdp("google");
  const github = new TestIdp("github");
  const providers = opts.providers ?? { google, github };
  const app = createApp({
    db: handle.db,
    config,
    providers,
    quota: opts.quota ?? ledgerQuota(),
    executor: opts.executor ?? createMockExecutor(),
  });
  return { app, handle, config, google, github };
}

export type Harness = Awaited<ReturnType<typeof setup>>;

/**
 * In-memory PGlite by default. With TEST_DATABASE_URL set (CI), each harness
 * gets its own throwaway Postgres database so locking and concurrency run
 * against the real server.
 */
async function freshDb(): Promise<DbHandle> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return createDb();
  const name = `agentflow_test_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  await admin.query(`create database ${name}`);
  await admin.end();
  const dbUrl = new URL(url);
  dbUrl.pathname = `/${name}`;
  const handle = createDb({ url: dbUrl.toString() });
  const close = handle.close;
  handle.close = async () => {
    await close();
    const dropper = new pg.Client({ connectionString: url });
    await dropper.connect();
    await dropper.query(`drop database if exists ${name} with (force)`);
    await dropper.end();
  };
  return handle;
}

/** Returns `name=value` pairs from Set-Cookie headers. */
export function cookiesFrom(res: Response): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of res.headers.getSetCookie()) {
    const [pair] = c.split(";");
    const i = pair!.indexOf("=");
    out[pair!.slice(0, i)] = pair!.slice(i + 1);
  }
  return out;
}

/** Runs the full start → callback flow and returns the session cookie header. */
export async function signIn(
  h: Harness,
  idp: TestIdp,
  profile: Parameters<TestIdp["issue"]>[0],
  opts: { cookie?: string; intent?: "link"; next?: string } = {},
) {
  const qs = new URLSearchParams();
  if (opts.next) qs.set("next", opts.next);
  const headers: Record<string, string> = opts.cookie ? { cookie: opts.cookie } : {};
  const start =
    opts.intent === "link"
      ? await h.app.request(`/auth/${idp.id}/link`, {
          method: "POST",
          headers: { ...headers, origin: ORIGIN },
        })
      : await h.app.request(`/auth/${idp.id}/start?${qs}`, { headers });
  const flow = cookiesFrom(start).af_oauth;
  const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
  const code = idp.issue(profile);
  const cookie = [opts.cookie, `af_oauth=${flow}`].filter(Boolean).join("; ");
  const res = await h.app.request(`/auth/${idp.id}/callback?state=${state}&code=${code}`, {
    headers: { cookie },
  });
  const session = cookiesFrom(res).af_session;
  return {
    res,
    cookie: session ? `af_session=${session}` : null,
    location: res.headers.get("location"),
  };
}

export const get = (h: Harness, path: string, cookie?: string | null) =>
  h.app.request(path, { headers: cookie ? { cookie } : {} });
