import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { appendAuditEvent, verifyAuditChain } from "./audit";
import { createDb, type DbHandle } from "./client";
import { auditEvents, users, workflowDefinitions, workflowVersions, workspaces } from "./schema";

let h: DbHandle;

/** Drizzle wraps driver errors; the trigger's message is on `cause`. */
async function expectAppendOnly(p: Promise<unknown>) {
  const err = await p.then(
    () => null,
    (e: unknown) => e as { message: string; cause?: { message?: string } },
  );
  expect(err, "mutation should have been rejected").not.toBeNull();
  expect(`${err!.message} ${err!.cause?.message ?? ""}`).toMatch(/append-only/);
}
beforeAll(async () => {
  h = createDb();
  await h.migrate();
});
afterAll(() => h.close());

describe("audit chain", () => {
  it("links every appended event and verifies", async () => {
    for (let i = 0; i < 5; i++) {
      await appendAuditEvent(h.db, { actorUserId: null, action: "test.event", detail: { i } });
    }
    const rows = await h.db.select().from(auditEvents).orderBy(auditEvents.seq);
    expect(rows[0]!.prevHash).toBeNull();
    for (let i = 1; i < rows.length; i++) expect(rows[i]!.prevHash).toBe(rows[i - 1]!.hash);
    expect(await verifyAuditChain(h.db)).toEqual({ ok: true, checked: 5, legacyUnchained: 0 });
  });

  it("concurrent appends do not fork the chain", async () => {
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        appendAuditEvent(h.db, { actorUserId: null, action: "test.concurrent", detail: { i } }),
      ),
    );
    const result = await verifyAuditChain(h.db);
    expect(result.ok).toBe(true);
  });

  it("rejects UPDATE, DELETE, and TRUNCATE at the database level", async () => {
    await expectAppendOnly(h.db.update(auditEvents).set({ action: "tampered" }));
    await expectAppendOnly(h.db.delete(auditEvents));
    await expectAppendOnly(h.db.execute(sql`truncate audit_events`));
  });

  it("detects tampering even if the trigger is bypassed by a superuser", async () => {
    const isolated = createDb();
    await isolated.migrate();
    try {
      for (let i = 0; i < 3; i++)
        await appendAuditEvent(isolated.db, {
          actorUserId: null,
          action: "test.event",
          detail: { i },
        });
      await isolated.db.execute(
        sql`alter table audit_events disable trigger audit_events_append_only`,
      );
      const [second] = await isolated.db
        .select()
        .from(auditEvents)
        .orderBy(auditEvents.seq)
        .limit(1)
        .offset(1);
      await isolated.db
        .update(auditEvents)
        .set({ detail: { i: 99 } })
        .where(eq(auditEvents.id, second!.id));
      const result = await verifyAuditChain(isolated.db);
      expect(result).toMatchObject({
        ok: false,
        reason: "hash mismatch",
        brokenAtSeq: second!.seq,
      });
    } finally {
      await isolated.close();
    }
  });
});

describe("workflow versions", () => {
  it("are immutable once written", async () => {
    const [u] = await h.db.insert(users).values({ email: "v@example.com" }).returning();
    const [w] = await h.db.insert(workspaces).values({ name: "W", ownerUserId: u!.id }).returning();
    const [d] = await h.db
      .insert(workflowDefinitions)
      .values({ workspaceId: w!.id, key: "k", name: "K", kind: "documents" })
      .returning();
    const spec = {
      schemaVersion: 1,
      kind: "documents",
      name: "x",
      description: "",
      steps: [],
    } as never;
    const [v] = await h.db
      .insert(workflowVersions)
      .values({ definitionId: d!.id, version: 1, spec, specHash: "h" })
      .returning();
    await expectAppendOnly(
      h.db.update(workflowVersions).set({ specHash: "evil" }).where(eq(workflowVersions.id, v!.id)),
    );
  });
});
