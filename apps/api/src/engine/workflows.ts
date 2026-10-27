import type {
  WorkflowDetail,
  WorkflowInfo,
  WorkflowSpec,
  WorkflowVersionInfo,
} from "@agentflow/contracts";
import { and, asc, desc, eq, schema, sql, type Db } from "@agentflow/db";
import { demoWorkflowSpecs, hashValue, validateSpec } from "@agentflow/workflow";
import { audit } from "../audit";
import { EngineError, notFound } from "./errors";

type DefinitionRow = typeof schema.workflowDefinitions.$inferSelect;
type VersionRow = typeof schema.workflowVersions.$inferSelect;

export const versionInfo = (v: VersionRow): WorkflowVersionInfo => ({
  id: v.id,
  version: v.version,
  specHash: v.specHash,
  spec: v.spec,
  createdAt: v.createdAt.toISOString(),
});

const workflowInfo = (d: DefinitionRow, latestVersion: number): WorkflowInfo => ({
  id: d.id,
  key: d.key,
  name: d.name,
  kind: d.kind,
  isDemo: d.isDemo,
  latestVersion,
  createdAt: d.createdAt.toISOString(),
});

function validOrThrow(input: unknown): WorkflowSpec {
  const result = validateSpec(input);
  if (!result.ok)
    throw new EngineError(422, "invalid_spec", "Workflow spec is invalid", result.issues);
  return result.spec;
}

export async function listWorkflows(db: Db, workspaceId: string): Promise<WorkflowInfo[]> {
  const rows = await db
    .select({
      d: schema.workflowDefinitions,
      latest: sql<number>`max(${schema.workflowVersions.version})::int`,
    })
    .from(schema.workflowDefinitions)
    .innerJoin(
      schema.workflowVersions,
      eq(schema.workflowVersions.definitionId, schema.workflowDefinitions.id),
    )
    .where(eq(schema.workflowDefinitions.workspaceId, workspaceId))
    .groupBy(schema.workflowDefinitions.id)
    .orderBy(asc(schema.workflowDefinitions.createdAt), asc(schema.workflowDefinitions.key));
  return rows.map((r) => workflowInfo(r.d, r.latest));
}

/** Workspace-scoped lookup: a definition from another workspace is simply not found. */
export async function getDefinition(db: Db, workspaceId: string, definitionId: string) {
  const [d] = await db
    .select()
    .from(schema.workflowDefinitions)
    .where(
      and(
        eq(schema.workflowDefinitions.id, definitionId),
        eq(schema.workflowDefinitions.workspaceId, workspaceId),
      ),
    );
  if (!d) throw notFound();
  return d;
}

export async function getWorkflowDetail(
  db: Db,
  workspaceId: string,
  definitionId: string,
): Promise<WorkflowDetail> {
  const d = await getDefinition(db, workspaceId, definitionId);
  const versions = await db
    .select()
    .from(schema.workflowVersions)
    .where(eq(schema.workflowVersions.definitionId, d.id))
    .orderBy(desc(schema.workflowVersions.version));
  return { ...workflowInfo(d, versions[0]?.version ?? 0), versions: versions.map(versionInfo) };
}

export async function createWorkflow(
  db: Db,
  args: {
    workspaceId: string;
    userId: string;
    key: string;
    name: string;
    spec: unknown;
    isDemo?: boolean;
  },
) {
  const spec = validOrThrow(args.spec);
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.workflowDefinitions.id })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.workspaceId, args.workspaceId),
          eq(schema.workflowDefinitions.key, args.key),
        ),
      );
    if (existing)
      throw new EngineError(409, "workflow_key_taken", "A workflow with this key already exists");
    const [d] = await tx
      .insert(schema.workflowDefinitions)
      .values({
        workspaceId: args.workspaceId,
        key: args.key,
        name: args.name,
        kind: spec.kind,
        isDemo: args.isDemo ?? false,
        createdBy: args.userId,
      })
      .returning();
    const specHash = hashValue(spec);
    await tx
      .insert(schema.workflowVersions)
      .values({ definitionId: d!.id, version: 1, spec, specHash, createdBy: args.userId });
    await audit(tx, {
      actorUserId: args.userId,
      workspaceId: args.workspaceId,
      action: "workflow.created",
      detail: { workflowId: d!.id, key: args.key, version: 1, specHash },
    });
    return d!.id;
  });
}

/**
 * Adds an immutable version. Submitting a spec identical to the latest version
 * is idempotent and returns that version instead of creating a duplicate.
 */
export async function createVersion(
  db: Db,
  args: { workspaceId: string; userId: string; definitionId: string; spec: unknown },
) {
  const spec = validOrThrow(args.spec);
  return db.transaction(async (tx) => {
    const [d] = await tx
      .select()
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.id, args.definitionId),
          eq(schema.workflowDefinitions.workspaceId, args.workspaceId),
        ),
      )
      .for("update");
    if (!d) throw notFound();
    if (spec.kind !== d.kind)
      throw new EngineError(422, "invalid_spec", "A new version cannot change the workflow kind", [
        "kind",
      ]);
    const [latest] = await tx
      .select()
      .from(schema.workflowVersions)
      .where(eq(schema.workflowVersions.definitionId, d.id))
      .orderBy(desc(schema.workflowVersions.version))
      .limit(1);
    const specHash = hashValue(spec);
    if (latest && latest.specHash === specHash)
      return { version: versionInfo(latest), created: false };
    const [v] = await tx
      .insert(schema.workflowVersions)
      .values({
        definitionId: d.id,
        version: (latest?.version ?? 0) + 1,
        spec,
        specHash,
        createdBy: args.userId,
      })
      .returning();
    await audit(tx, {
      actorUserId: args.userId,
      workspaceId: args.workspaceId,
      action: "workflow.version_created",
      detail: { workflowId: d.id, version: v!.version, specHash },
    });
    return { version: versionInfo(v!), created: true };
  });
}

/** Seeds the three deterministic demo workflows into a workspace (idempotent by key). */
export async function seedDemoWorkflows(db: Db, workspaceId: string, userId: string | null) {
  for (const demo of demoWorkflowSpecs()) {
    const [existing] = await db
      .select({ id: schema.workflowDefinitions.id })
      .from(schema.workflowDefinitions)
      .where(
        and(
          eq(schema.workflowDefinitions.workspaceId, workspaceId),
          eq(schema.workflowDefinitions.key, demo.key),
        ),
      );
    if (existing) continue;
    const [d] = await db
      .insert(schema.workflowDefinitions)
      .values({
        workspaceId,
        key: demo.key,
        name: demo.name,
        kind: demo.spec.kind,
        isDemo: true,
        createdBy: userId,
      })
      .returning({ id: schema.workflowDefinitions.id });
    await db.insert(schema.workflowVersions).values({
      definitionId: d!.id,
      version: 1,
      spec: demo.spec,
      specHash: hashValue(demo.spec),
      createdBy: userId,
    });
  }
}

/** Startup backfill for workspaces created before demo workflows existed. */
export async function backfillDemoWorkflows(db: Db) {
  const all = await db
    .select({ id: schema.workspaces.id, owner: schema.workspaces.ownerUserId })
    .from(schema.workspaces);
  for (const w of all) await db.transaction((tx) => seedDemoWorkflows(tx, w.id, w.owner));
}
