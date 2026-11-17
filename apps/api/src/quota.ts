import { and, eq, gte, schema, sql, type Db } from "@agentflow/db";
import type { TokenBudget } from "@agentflow/models";
import { audit } from "./audit";

export type ReserveResult =
  { ok: true; reservationId: string } | { ok: false; code: "quota_exceeded"; message: string };

/**
 * Quota hooks around run lifecycles (reserve → settle | release). They only
 * record usage; nothing is charged and no external service is called.
 * Billing (M13) will plug entitlements in here.
 */
export interface QuotaHooks {
  reserve(
    db: Db,
    req: { workspaceId: string; userId: string; kind: "run"; amount: number },
  ): Promise<ReserveResult>;
  settle(db: Db, reservationId: string, usage: Record<string, number>): Promise<void>;
  release(db: Db, reservationId: string): Promise<void>;
}

/**
 * Default hooks: a local ledger with an optional monthly run limit per
 * workspace (unset = unlimited). A per-workspace advisory lock makes the
 * count-then-insert check race-free on Postgres (B8).
 */
export function ledgerQuota(
  opts: { monthlyRunLimit: number | null } = { monthlyRunLimit: null },
): QuotaHooks {
  return {
    async reserve(db, req) {
      await db.execute(sql`select pg_advisory_xact_lock(hashtext(${`quota:${req.workspaceId}`}))`);
      if (opts.monthlyRunLimit !== null) {
        const now = new Date();
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        const [{ used }] = (await db
          .select({ used: sql<number>`coalesce(sum(${schema.quotaReservations.amount}), 0)::int` })
          .from(schema.quotaReservations)
          .where(
            and(
              eq(schema.quotaReservations.workspaceId, req.workspaceId),
              eq(schema.quotaReservations.kind, req.kind),
              gte(schema.quotaReservations.createdAt, monthStart),
              sql`${schema.quotaReservations.status} <> 'released'`,
            ),
          )) as [{ used: number }];
        if (used + req.amount > opts.monthlyRunLimit) {
          await audit(db, {
            actorUserId: req.userId,
            workspaceId: req.workspaceId,
            action: "quota.denied",
            detail: { kind: req.kind, used, limit: opts.monthlyRunLimit },
          });
          return {
            ok: false,
            code: "quota_exceeded",
            message: "Monthly run quota reached for this workspace",
          };
        }
      }
      const [row] = await db
        .insert(schema.quotaReservations)
        .values({
          workspaceId: req.workspaceId,
          userId: req.userId,
          kind: req.kind,
          amount: req.amount,
        })
        .returning({ id: schema.quotaReservations.id });
      await audit(db, {
        actorUserId: req.userId,
        workspaceId: req.workspaceId,
        action: "quota.reserved",
        detail: { reservationId: row!.id, kind: req.kind, amount: req.amount },
      });
      return { ok: true, reservationId: row!.id };
    },
    async settle(db, reservationId, usage) {
      const [row] = await db
        .update(schema.quotaReservations)
        .set({ status: "settled", usage, closedAt: new Date() })
        .where(
          and(
            eq(schema.quotaReservations.id, reservationId),
            eq(schema.quotaReservations.status, "reserved"),
          ),
        )
        .returning();
      if (row)
        await audit(db, {
          actorUserId: null,
          workspaceId: row.workspaceId,
          action: "quota.settled",
          detail: { reservationId, ...usage },
        });
    },
    async release(db, reservationId) {
      const [row] = await db
        .update(schema.quotaReservations)
        .set({ status: "released", closedAt: new Date() })
        .where(
          and(
            eq(schema.quotaReservations.id, reservationId),
            eq(schema.quotaReservations.status, "reserved"),
          ),
        )
        .returning();
      if (row)
        await audit(db, {
          actorUserId: null,
          workspaceId: row.workspaceId,
          action: "quota.released",
          detail: { reservationId },
        });
    },
  };
}

/**
 * Hosted-model token budget backed by the same ledger (kind "model_tokens").
 * Reserves the estimated maximum, then settles to actual usage. Nothing is
 * charged; BYOK calls never reach this (ADR-010).
 */
export function ledgerTokenBudget(db: Db, opts: { monthlyTokenLimit: number | null }): TokenBudget {
  return {
    async reserve({ workspaceId, userId, tokens }) {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`tokens:${workspaceId}`}))`);
        if (opts.monthlyTokenLimit !== null) {
          const now = new Date();
          const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
          const [{ used }] = (await tx
            .select({
              used: sql<number>`coalesce(sum(${schema.quotaReservations.amount}), 0)::int`,
            })
            .from(schema.quotaReservations)
            .where(
              and(
                eq(schema.quotaReservations.workspaceId, workspaceId),
                eq(schema.quotaReservations.kind, "model_tokens"),
                gte(schema.quotaReservations.createdAt, monthStart),
                sql`${schema.quotaReservations.status} <> 'released'`,
              ),
            )) as [{ used: number }];
          if (used + tokens > opts.monthlyTokenLimit) {
            await audit(tx, {
              actorUserId: userId,
              workspaceId,
              action: "quota.denied",
              detail: {
                kind: "model_tokens",
                used,
                requested: tokens,
                limit: opts.monthlyTokenLimit,
              },
            });
            return { ok: false as const };
          }
        }
        const [row] = await tx
          .insert(schema.quotaReservations)
          .values({ workspaceId, userId, kind: "model_tokens", amount: tokens })
          .returning({ id: schema.quotaReservations.id });
        return { ok: true as const, id: row!.id };
      });
    },
    async settle(id, usage) {
      await db
        .update(schema.quotaReservations)
        .set({
          status: "settled",
          amount: usage.inputTokens + usage.outputTokens,
          usage,
          closedAt: new Date(),
        })
        .where(
          and(eq(schema.quotaReservations.id, id), eq(schema.quotaReservations.status, "reserved")),
        );
    },
    async release(id) {
      await db
        .update(schema.quotaReservations)
        .set({ status: "released", closedAt: new Date() })
        .where(
          and(eq(schema.quotaReservations.id, id), eq(schema.quotaReservations.status, "reserved")),
        );
    },
  };
}
