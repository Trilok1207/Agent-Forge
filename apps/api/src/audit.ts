import { appendAuditEvent, type AuditDetail, type Db } from "@agentflow/db";

export type AuditAction =
  | "user.created"
  | "workspace.created"
  | "auth.sign_in"
  | "auth.sign_out"
  | "auth.provider_linked"
  | "session.revoked"
  | "workflow.created"
  | "workflow.version_created"
  | "run.created"
  | "run.transition"
  | "run.step_completed"
  | "run.step_failed"
  | "approval.requested"
  | "approval.decided"
  | "quota.reserved"
  | "quota.denied"
  | "quota.settled"
  | "quota.released";

/**
 * Appends to the hash-chained, append-only audit log. Ids, codes, and
 * decisions only: never tokens, secrets, prompts, or file/user content.
 */
export async function audit(
  db: Pick<Db, "transaction">,
  e: {
    actorUserId: string | null;
    workspaceId?: string | null;
    action: AuditAction;
    detail?: AuditDetail;
  },
) {
  await appendAuditEvent(db, e);
}
