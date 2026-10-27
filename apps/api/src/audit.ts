import { schema, type Db } from "@agentflow/db";

export type AuditAction =
  | "user.created"
  | "workspace.created"
  | "auth.sign_in"
  | "auth.sign_out"
  | "auth.provider_linked"
  | "session.revoked";

/** Records ids and decisions only. Never pass tokens, secrets, or user content. */
export async function audit(
  db: Pick<Db, "insert">,
  e: {
    actorUserId: string | null;
    workspaceId?: string | null;
    action: AuditAction;
    detail?: Record<string, string | number | boolean>;
  },
) {
  await db.insert(schema.auditEvents).values({
    actorUserId: e.actorUserId,
    workspaceId: e.workspaceId ?? null,
    action: e.action,
    detail: e.detail ?? {},
  });
}
