import { createHash } from "node:crypto";
import { asc, desc, sql } from "drizzle-orm";
import type { Db } from "./client";
import { auditEvents } from "./schema";

export type AuditDetail = Record<string, string | number | boolean>;

export interface AuditEventInput {
  actorUserId: string | null;
  workspaceId?: string | null;
  action: string;
  detail?: AuditDetail;
}

/** Arbitrary constant key for the advisory lock that serialises chain appends. */
const AUDIT_CHAIN_LOCK = 727_101;

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function auditHash(
  prevHash: string | null,
  e: {
    id: string;
    at: Date;
    actorUserId: string | null;
    workspaceId: string | null;
    action: string;
    detail: AuditDetail;
  },
) {
  const body = canonical({
    prev: prevHash,
    id: e.id,
    at: e.at.toISOString(),
    actor: e.actorUserId,
    workspace: e.workspaceId,
    action: e.action,
    detail: e.detail,
  });
  return createHash("sha256").update(body).digest("hex");
}

/**
 * Appends one event to the hash chain. Runs in its own (sub)transaction holding
 * an advisory lock, so concurrent writers can't fork the chain.
 */
export async function appendAuditEvent(db: Pick<Db, "transaction">, input: AuditEventInput) {
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${AUDIT_CHAIN_LOCK})`);
    const [last] = await tx
      .select({ hash: auditEvents.hash })
      .from(auditEvents)
      .orderBy(desc(auditEvents.seq))
      .limit(1);
    const event = {
      id: crypto.randomUUID(),
      // JS dates are millisecond precision, which timestamptz stores exactly, so the hash round-trips.
      at: new Date(),
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId ?? null,
      action: input.action,
      detail: input.detail ?? {},
    };
    const prevHash = last?.hash ?? null;
    await tx.insert(auditEvents).values({ ...event, prevHash, hash: auditHash(prevHash, event) });
  });
}

export type ChainVerification =
  | { ok: true; checked: number; legacyUnchained: number }
  | { ok: false; brokenAtSeq: number; reason: string };

/**
 * Recomputes the whole chain. Rows without a hash are accepted only as a
 * leading legacy prefix (written before hashing existed).
 */
export async function verifyAuditChain(db: Db): Promise<ChainVerification> {
  const rows = await db.select().from(auditEvents).orderBy(asc(auditEvents.seq));
  let prev: string | null = null;
  let legacy = 0;
  let chained = 0;
  for (const r of rows) {
    if (r.hash === null) {
      if (chained > 0)
        return { ok: false, brokenAtSeq: r.seq, reason: "unhashed row after chain start" };
      legacy++;
      continue;
    }
    if (r.prevHash !== prev) return { ok: false, brokenAtSeq: r.seq, reason: "prev_hash mismatch" };
    if (auditHash(prev, r) !== r.hash)
      return { ok: false, brokenAtSeq: r.seq, reason: "hash mismatch" };
    prev = r.hash;
    chained++;
  }
  return { ok: true, checked: chained, legacyUnchained: legacy };
}
