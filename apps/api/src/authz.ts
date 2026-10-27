import { and, eq, schema, type Db } from "@agentflow/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: string) => UUID.test(v);

/**
 * Single authorization gate for workspace-scoped data (B11). Returns the
 * caller's role, or null when the workspace doesn't exist OR the caller isn't a
 * member. Callers answer both with 404 so ids can't be probed.
 */
export async function workspaceRole(db: Db, userId: string, workspaceId: string) {
  if (!isUuid(workspaceId)) return null;
  const rows = await db
    .select({ role: schema.workspaceMembers.role, name: schema.workspaces.name })
    .from(schema.workspaceMembers)
    .innerJoin(schema.workspaces, eq(schema.workspaces.id, schema.workspaceMembers.workspaceId))
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
