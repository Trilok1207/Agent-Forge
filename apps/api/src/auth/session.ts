import { createHash, randomBytes } from "node:crypto";
import { eq, schema, type Db } from "@agentflow/db";
import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Config } from "../config";

const DAY = 24 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 30 * DAY;
const RENEW_WHEN_REMAINING_MS = 15 * DAY;

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}
export interface AuthState {
  user: SessionUser;
  sessionId: string;
}

/** `__Host-` prefix (HTTPS only) pins the cookie to our exact origin. */
export function cookieNames(config: Pick<Config, "secureCookies">) {
  const p = config.secureCookies ? "__Host-" : "";
  return { session: `${p}af_session`, oauth: `${p}af_oauth` };
}

export function cookieOptions(config: Pick<Config, "secureCookies">, maxAgeSeconds: number) {
  return {
    httpOnly: true,
    secure: config.secureCookies,
    sameSite: "Lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(
  db: Db,
  userId: string,
  userAgent: string | null,
  now = new Date(),
) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  const [row] = await db
    .insert(schema.sessions)
    .values({
      tokenHash: hashToken(token),
      userId,
      userAgent: userAgent?.slice(0, 256) ?? null,
      expiresAt,
    })
    .returning({ id: schema.sessions.id });
  return { token, sessionId: row!.id, expiresAt };
}

/** Looks up a session by raw token. Expired sessions are deleted. Renews sessions past half-life. */
export async function validateSessionToken(db: Db, token: string, now = new Date()) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const rows = await db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.tokenHash, hashToken(token)))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.session.expiresAt.getTime() <= now.getTime()) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, row.session.id));
    return null;
  }
  let renewedUntil: Date | null = null;
  if (row.session.expiresAt.getTime() - now.getTime() < RENEW_WHEN_REMAINING_MS) {
    renewedUntil = new Date(now.getTime() + SESSION_TTL_MS);
    await db
      .update(schema.sessions)
      .set({ expiresAt: renewedUntil })
      .where(eq(schema.sessions.id, row.session.id));
  }
  const { id, email, name, avatarUrl } = row.user;
  return {
    auth: { user: { id, email, name, avatarUrl }, sessionId: row.session.id },
    renewedUntil,
  };
}

export async function deleteSession(db: Db, sessionId: string) {
  await db.delete(schema.sessions).where(eq(schema.sessions.id, sessionId));
}

export function setSessionCookie(c: Context, config: Config, token: string, expiresAt: Date) {
  const maxAge = Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
  setCookie(c, cookieNames(config).session, token, cookieOptions(config, maxAge));
}

export function clearSessionCookie(c: Context, config: Config) {
  deleteCookie(c, cookieNames(config).session, { path: "/", secure: config.secureCookies });
}

export function readSessionToken(c: Context, config: Config): string | undefined {
  return getCookie(c, cookieNames(config).session);
}
