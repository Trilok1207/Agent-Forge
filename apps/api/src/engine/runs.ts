import {
  ApprovalDecisionRequest,
  CreateRunRequest,
  STEP_REGISTRY,
  type RunInfo,
  type RunStatus,
  type WorkflowSpec,
  type WorkflowStep,
} from "@agentflow/contracts";
import { and, asc, desc, eq, inArray, schema, type Db } from "@agentflow/db";
import {
  assertTransition,
  canonicalJson,
  hashValue,
  isTerminal,
  sha256Hex,
  validateSpec,
  type StepExecutor,
} from "@agentflow/workflow";
import { audit } from "../audit";
import type { QuotaHooks } from "../quota";
import { EngineError, notFound } from "./errors";

type RunRow = typeof schema.workflowRuns.$inferSelect;
type StepRow = typeof schema.runSteps.$inferSelect;

export interface EngineDeps {
  db: Db;
  quota: QuotaHooks;
  executor: StepExecutor;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;

// ---------------------------------------------------------------- reads

export async function loadRunInfo(db: Db, workspaceId: string, runId: string): Promise<RunInfo> {
  if (!UUID.test(runId)) throw notFound();
  const [row] = await db
    .select({ run: schema.workflowRuns, version: schema.workflowVersions.version })
    .from(schema.workflowRuns)
    .innerJoin(
      schema.workflowVersions,
      eq(schema.workflowVersions.id, schema.workflowRuns.versionId),
    )
    .where(
      and(eq(schema.workflowRuns.id, runId), eq(schema.workflowRuns.workspaceId, workspaceId)),
    );
  if (!row) throw notFound();
  const [steps, approvals] = await Promise.all([
    db
      .select()
      .from(schema.runSteps)
      .where(eq(schema.runSteps.runId, runId))
      .orderBy(asc(schema.runSteps.position)),
    db
      .select()
      .from(schema.approvalRequests)
      .where(eq(schema.approvalRequests.runId, runId))
      .orderBy(asc(schema.approvalRequests.requestedAt)),
  ]);
  const stepKey = new Map(steps.map((s) => [s.id, s.key]));
  return {
    ...runSummary(row.run, row.version),
    steps: steps.map((s) => ({
      id: s.id,
      key: s.key,
      position: s.position,
      type: s.type as WorkflowStep["type"],
      title: s.title,
      status: s.status,
      output: s.output ?? null,
      outputHash: s.outputHash,
      errorCode: s.errorCode,
    })),
    approvals: approvals.map((a) => ({
      id: a.id,
      kind: a.kind,
      stepKey: a.stepId ? (stepKey.get(a.stepId) ?? null) : null,
      status: a.status,
      title: a.title,
      destination: a.destination,
      content: a.content,
      contentHash: a.contentHash,
      requestedAt: a.requestedAt.toISOString(),
      decidedAt: a.decidedAt?.toISOString() ?? null,
    })),
  };
}

function runSummary(run: RunRow, version: number) {
  return {
    id: run.id,
    workspaceId: run.workspaceId,
    workflowId: run.definitionId,
    versionId: run.versionId,
    version,
    status: run.status,
    stateVersion: run.stateVersion,
    input: run.input,
    errorCode: run.errorCode,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
  };
}

export async function listRuns(db: Db, workspaceId: string) {
  const rows = await db
    .select({ run: schema.workflowRuns, version: schema.workflowVersions.version })
    .from(schema.workflowRuns)
    .innerJoin(
      schema.workflowVersions,
      eq(schema.workflowVersions.id, schema.workflowRuns.versionId),
    )
    .where(eq(schema.workflowRuns.workspaceId, workspaceId))
    .orderBy(desc(schema.workflowRuns.createdAt))
    .limit(100);
  return rows.map((r) => runSummary(r.run, r.version));
}

// ---------------------------------------------------------------- transitions

/**
 * The only way a run's status changes. Validates against the transition table
 * and compare-and-sets on (status, stateVersion), so a concurrent or replayed
 * request that read stale state fails instead of double-applying.
 */
async function transition(
  db: Db,
  run: RunRow,
  to: RunStatus,
  actorUserId: string | null,
  extra: { errorCode?: string; completedAt?: Date } = {},
) {
  assertTransition(run.status, to);
  const [updated] = await db
    .update(schema.workflowRuns)
    .set({ status: to, stateVersion: run.stateVersion + 1, updatedAt: new Date(), ...extra })
    .where(
      and(
        eq(schema.workflowRuns.id, run.id),
        eq(schema.workflowRuns.status, run.status),
        eq(schema.workflowRuns.stateVersion, run.stateVersion),
      ),
    )
    .returning();
  if (!updated)
    throw new EngineError(409, "run_state_conflict", "The run changed; reload and retry");
  await audit(db, {
    actorUserId,
    workspaceId: run.workspaceId,
    action: "run.transition",
    detail: {
      runId: run.id,
      from: run.status,
      to,
      ...(extra.errorCode ? { errorCode: extra.errorCode } : {}),
    },
  });
  Object.assign(run, updated);
}

// ---------------------------------------------------------------- create

/** The exact content a user approves before anything runs. */
function planApprovalContent(args: {
  workflowKey: string;
  version: number;
  specHash: string;
  spec: WorkflowSpec;
  order: string[];
  input: unknown;
}) {
  const byId = new Map(args.spec.steps.map((s) => [s.id, s]));
  return canonicalJson({
    workflow: args.workflowKey,
    version: args.version,
    specHash: args.specHash,
    input: args.input,
    steps: args.order.map((id) => {
      const s = byId.get(id)!;
      return { id, type: s.type, title: s.title, ...STEP_REGISTRY[s.type] };
    }),
  });
}

async function loadVersionForRun(db: Db, run: RunRow) {
  const [row] = await db
    .select({ v: schema.workflowVersions, key: schema.workflowDefinitions.key })
    .from(schema.workflowVersions)
    .innerJoin(
      schema.workflowDefinitions,
      eq(schema.workflowDefinitions.id, schema.workflowVersions.definitionId),
    )
    .where(eq(schema.workflowVersions.id, run.versionId));
  // Defence in depth: re-validate the stored spec every time it is used.
  const checked = validateSpec(row!.v.spec);
  if (!checked.ok || hashValue(checked.spec) !== row!.v.specHash) {
    throw new EngineError(
      409,
      "invalid_workflow_version",
      "Stored workflow version failed validation",
    );
  }
  return { version: row!.v, key: row!.key, spec: checked.spec, order: checked.order };
}

export async function createRun(
  deps: EngineDeps,
  args: { workspaceId: string; userId: string; idempotencyKey: string | undefined; body: unknown },
): Promise<{ run: RunInfo; replayed: boolean }> {
  const { db } = deps;
  if (!args.idempotencyKey || !IDEMPOTENCY_KEY.test(args.idempotencyKey)) {
    throw new EngineError(
      400,
      "idempotency_key_required",
      "Send an Idempotency-Key header (8-128 chars of [A-Za-z0-9_.:-])",
    );
  }
  const parsed = CreateRunRequest.safeParse(args.body);
  if (!parsed.success) {
    throw new EngineError(
      422,
      "invalid_request",
      "Invalid run request",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const body = parsed.data;
  const requestHash = hashValue(body);

  const findExisting = async () => {
    const [existing] = await db
      .select()
      .from(schema.workflowRuns)
      .where(
        and(
          eq(schema.workflowRuns.workspaceId, args.workspaceId),
          eq(schema.workflowRuns.createdBy, args.userId),
          eq(schema.workflowRuns.idempotencyKey, args.idempotencyKey!),
        ),
      );
    if (!existing) return null;
    if (existing.requestHash !== requestHash) {
      throw new EngineError(
        422,
        "idempotency_key_reused",
        "This Idempotency-Key was already used with a different request",
      );
    }
    return { run: await loadRunInfo(db, args.workspaceId, existing.id), replayed: true };
  };

  const replay = await findExisting();
  if (replay) return replay;

  try {
    const runId = await db.transaction(async (tx) => {
      const [def] = await tx
        .select()
        .from(schema.workflowDefinitions)
        .where(
          and(
            eq(schema.workflowDefinitions.id, body.workflowId),
            eq(schema.workflowDefinitions.workspaceId, args.workspaceId),
          ),
        );
      if (!def) throw new EngineError(404, "workflow_not_found", "Workflow not found");
      const versions = await tx
        .select()
        .from(schema.workflowVersions)
        .where(
          body.version
            ? and(
                eq(schema.workflowVersions.definitionId, def.id),
                eq(schema.workflowVersions.version, body.version),
              )
            : eq(schema.workflowVersions.definitionId, def.id),
        )
        .orderBy(desc(schema.workflowVersions.version))
        .limit(1);
      const version = versions[0];
      if (!version) throw new EngineError(404, "version_not_found", "Workflow version not found");

      if (body.input.projectId) {
        // Ownership check on referenced data: the project must live in this workspace.
        const [project] = await tx
          .select({ id: schema.projects.id })
          .from(schema.projects)
          .where(
            and(
              eq(schema.projects.id, body.input.projectId),
              eq(schema.projects.workspaceId, args.workspaceId),
            ),
          );
        if (!project)
          throw new EngineError(422, "project_not_found", "Project not found in this workspace");
      }

      const checked = validateSpec(version.spec);
      if (!checked.ok || hashValue(checked.spec) !== version.specHash) {
        throw new EngineError(
          409,
          "invalid_workflow_version",
          "Stored workflow version failed validation",
        );
      }

      const reservation = await deps.quota.reserve(tx, {
        workspaceId: args.workspaceId,
        userId: args.userId,
        kind: "run",
        amount: 1,
      });
      if (!reservation.ok) throw new EngineError(429, reservation.code, reservation.message);

      const [run] = await tx
        .insert(schema.workflowRuns)
        .values({
          workspaceId: args.workspaceId,
          definitionId: def.id,
          versionId: version.id,
          createdBy: args.userId,
          status: "draft",
          input: body.input,
          idempotencyKey: args.idempotencyKey!,
          requestHash,
          quotaReservationId: reservation.reservationId,
        })
        .returning();
      const byId = new Map(checked.spec.steps.map((s) => [s.id, s]));
      await tx.insert(schema.runSteps).values(
        checked.order.map((id, position) => ({
          runId: run!.id,
          key: id,
          position,
          type: byId.get(id)!.type,
          title: byId.get(id)!.title,
        })),
      );
      await audit(tx, {
        actorUserId: args.userId,
        workspaceId: args.workspaceId,
        action: "run.created",
        detail: { runId: run!.id, workflowId: def.id, version: version.version },
      });
      await transition(tx, run!, "planned", args.userId);
      const content = planApprovalContent({
        workflowKey: def.key,
        version: version.version,
        specHash: version.specHash,
        spec: checked.spec,
        order: checked.order,
        input: body.input,
      });
      const [approval] = await tx
        .insert(schema.approvalRequests)
        .values({
          runId: run!.id,
          kind: "plan",
          title: `Run "${def.name}" v${version.version}`,
          content,
          contentHash: sha256Hex(content),
        })
        .returning({ id: schema.approvalRequests.id });
      await audit(tx, {
        actorUserId: args.userId,
        workspaceId: args.workspaceId,
        action: "approval.requested",
        detail: { runId: run!.id, approvalId: approval!.id, kind: "plan" },
      });
      await transition(tx, run!, "awaiting_plan_approval", args.userId);
      return run!.id;
    });
    return { run: await loadRunInfo(db, args.workspaceId, runId), replayed: false };
  } catch (e) {
    // A concurrent request with the same key won the insert: replay its result.
    if (isUniqueViolation(e)) {
      const again = await findExisting();
      if (again) return again;
    }
    throw e;
  }
}

function isUniqueViolation(e: unknown): boolean {
  const err = e as { code?: string; cause?: { code?: string } };
  return err?.code === "23505" || err?.cause?.code === "23505";
}

// ---------------------------------------------------------------- approvals

export async function decideApproval(
  deps: EngineDeps,
  args: { workspaceId: string; userId: string; runId: string; approvalId: string; body: unknown },
): Promise<{ run: RunInfo; replayed: boolean }> {
  const { db } = deps;
  if (!UUID.test(args.runId) || !UUID.test(args.approvalId)) throw notFound();
  const parsed = ApprovalDecisionRequest.safeParse(args.body);
  if (!parsed.success) {
    throw new EngineError(
      422,
      "invalid_request",
      "Invalid decision",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const decision = parsed.data;

  const replayed = await db.transaction(async (tx) => {
    // Lock the run so concurrent decisions on it serialise.
    const [run] = await tx
      .select()
      .from(schema.workflowRuns)
      .where(
        and(
          eq(schema.workflowRuns.id, args.runId),
          eq(schema.workflowRuns.workspaceId, args.workspaceId),
        ),
      )
      .for("update");
    if (!run) throw notFound();
    const [approval] = await tx
      .select()
      .from(schema.approvalRequests)
      .where(
        and(
          eq(schema.approvalRequests.id, args.approvalId),
          eq(schema.approvalRequests.runId, run.id),
        ),
      );
    if (!approval) throw notFound();

    const wanted = decision.decision === "approve" ? "approved" : "rejected";
    if (approval.status !== "pending") {
      // Same decision repeated → idempotent replay. Anything else is a conflict.
      if (approval.status === wanted && approval.decidedBy === args.userId) return true;
      throw new EngineError(
        409,
        "approval_already_decided",
        `Approval is already ${approval.status}`,
      );
    }

    const expectedRunStatus: RunStatus =
      approval.kind === "plan" ? "awaiting_plan_approval" : "awaiting_action_approval";
    if (run.status !== expectedRunStatus) {
      throw new EngineError(409, "invalid_state", `Run is ${run.status}, not ${expectedRunStatus}`);
    }

    const loaded = await loadVersionForRun(tx, run);
    let step: StepRow | undefined;
    if (approval.kind === "action") {
      [step] = await tx
        .select()
        .from(schema.runSteps)
        .where(eq(schema.runSteps.id, approval.stepId!));
      if (!step || step.status !== "awaiting_approval")
        throw new EngineError(409, "invalid_state", "Step is not awaiting approval");
    }

    if (decision.decision === "approve") {
      if (decision.contentHash !== approval.contentHash) {
        throw new EngineError(
          409,
          "content_hash_mismatch",
          "Approved content does not match the current request; reload it",
        );
      }
      // Recompute what would run now and require it to still match the approved hash.
      const current =
        approval.kind === "plan"
          ? sha256Hex(
              planApprovalContent({
                workflowKey: loaded.key,
                version: loaded.version.version,
                specHash: loaded.version.specHash,
                spec: loaded.spec,
                order: loaded.order,
                input: run.input,
              }),
            )
          : sha256Hex((await proposalFor(deps, tx, run, loaded.spec, step!)).content);
      if (current !== approval.contentHash) {
        throw new EngineError(
          409,
          "content_changed",
          "The content changed since approval was requested",
        );
      }
    }

    const [updated] = await tx
      .update(schema.approvalRequests)
      .set({
        status: wanted,
        decidedAt: new Date(),
        decidedBy: args.userId,
        reason: decision.decision === "reject" ? (decision.reason ?? null) : null,
      })
      .where(
        and(
          eq(schema.approvalRequests.id, approval.id),
          eq(schema.approvalRequests.status, "pending"),
        ),
      )
      .returning({ id: schema.approvalRequests.id });
    if (!updated)
      throw new EngineError(409, "approval_already_decided", "Approval was decided concurrently");
    await audit(tx, {
      actorUserId: args.userId,
      workspaceId: args.workspaceId,
      action: "approval.decided",
      detail: {
        runId: run.id,
        approvalId: approval.id,
        kind: approval.kind,
        decision: wanted,
        contentHash: approval.contentHash,
      },
    });

    if (decision.decision === "reject") {
      if (step)
        await tx
          .update(schema.runSteps)
          .set({ status: "rejected", finishedAt: new Date() })
          .where(eq(schema.runSteps.id, step.id));
      await endRun(
        deps,
        tx,
        run,
        "cancelled",
        args.userId,
        approval.kind === "plan" ? "plan_rejected" : "action_rejected",
      );
      return false;
    }

    if (approval.kind === "plan") {
      await transition(tx, run, "queued", args.userId);
      await transition(tx, run, "running", args.userId);
    } else {
      await transition(tx, run, "running", args.userId);
    }
    await advance(deps, tx, run, args.userId);
    return false;
  });
  return { run: await loadRunInfo(db, args.workspaceId, args.runId), replayed };
}

// ---------------------------------------------------------------- execution

async function priorOutputs(db: Db, runId: string) {
  const done = await db
    .select({ key: schema.runSteps.key, output: schema.runSteps.output })
    .from(schema.runSteps)
    .where(and(eq(schema.runSteps.runId, runId), eq(schema.runSteps.status, "succeeded")));
  return Object.fromEntries(done.map((d) => [d.key, d.output]));
}

async function proposalFor(
  deps: EngineDeps,
  db: Db,
  run: RunRow,
  spec: WorkflowSpec,
  step: StepRow,
) {
  const def = spec.steps.find((s) => s.id === step.key)!;
  return deps.executor.proposeAction(def, {
    spec,
    input: run.input,
    outputs: await priorOutputs(db, run.id),
  });
}

/**
 * Runs steps in order until the run completes, fails, or reaches a step that
 * needs approval. Side-effecting steps (by registry, not by the spec's flag)
 * execute only with an approved action approval whose hash matches the
 * content being written — re-checked here even though the API checked it too.
 */
async function advance(deps: EngineDeps, db: Db, run: RunRow, actorUserId: string | null) {
  const { spec } = await loadVersionForRun(db, run);
  const defs = new Map(spec.steps.map((s) => [s.id, s]));
  let executed = 0;

  while (run.status === "running") {
    const steps = await db
      .select()
      .from(schema.runSteps)
      .where(eq(schema.runSteps.runId, run.id))
      .orderBy(asc(schema.runSteps.position));
    const succeeded = new Set(steps.filter((s) => s.status === "succeeded").map((s) => s.key));
    const next = steps.find(
      (s) =>
        (s.status === "pending" || s.status === "awaiting_approval") &&
        defs.get(s.key)!.dependsOn.every((d) => succeeded.has(d)),
    );
    if (!next) {
      if (steps.every((s) => s.status === "succeeded")) {
        await endRun(deps, db, run, "completed", actorUserId, undefined, executed);
      } else {
        await endRun(deps, db, run, "failed", actorUserId, "stalled", executed);
      }
      return;
    }
    const def = defs.get(next.key)!;
    const ctx = { spec, input: run.input, outputs: await priorOutputs(db, run.id) };

    if (STEP_REGISTRY[def.type].effect !== "none") {
      const [approval] = await db
        .select()
        .from(schema.approvalRequests)
        .where(
          and(
            eq(schema.approvalRequests.stepId, next.id),
            eq(schema.approvalRequests.kind, "action"),
          ),
        );
      if (!approval) {
        const proposal = deps.executor.proposeAction(def, ctx);
        const [created] = await db
          .insert(schema.approvalRequests)
          .values({
            runId: run.id,
            stepId: next.id,
            kind: "action",
            title: proposal.title,
            destination: proposal.destination,
            content: proposal.content,
            contentHash: sha256Hex(proposal.content),
          })
          .returning({ id: schema.approvalRequests.id });
        await db
          .update(schema.runSteps)
          .set({ status: "awaiting_approval" })
          .where(eq(schema.runSteps.id, next.id));
        await audit(db, {
          actorUserId,
          workspaceId: run.workspaceId,
          action: "approval.requested",
          detail: { runId: run.id, approvalId: created!.id, kind: "action", step: next.key },
        });
        await transition(db, run, "awaiting_action_approval", actorUserId);
        return;
      }
      const proposal = deps.executor.proposeAction(def, ctx);
      const valid =
        approval.status === "approved" &&
        approval.decidedBy !== null &&
        (await isMember(db, run.workspaceId, approval.decidedBy)) &&
        approval.contentHash === sha256Hex(proposal.content);
      if (!valid) {
        await failStep(db, run, next, "approval_invalid", actorUserId);
        await endRun(deps, db, run, "failed", actorUserId, "approval_invalid", executed);
        return;
      }
      await completeStep(
        db,
        run,
        next,
        deps.executor.performAction(def, ctx, proposal),
        actorUserId,
      );
      executed++;
      continue;
    }

    let output: unknown;
    try {
      output = deps.executor.run(def, ctx);
    } catch {
      // Executor errors may contain content; record only a code.
      await failStep(db, run, next, "step_failed", actorUserId);
      await endRun(deps, db, run, "failed", actorUserId, `step_failed:${next.key}`, executed);
      return;
    }
    await completeStep(db, run, next, output, actorUserId);
    executed++;
  }
}

async function isMember(db: Db, workspaceId: string, userId: string) {
  const [m] = await db
    .select({ u: schema.workspaceMembers.userId })
    .from(schema.workspaceMembers)
    .where(
      and(
        eq(schema.workspaceMembers.workspaceId, workspaceId),
        eq(schema.workspaceMembers.userId, userId),
      ),
    );
  return Boolean(m);
}

async function completeStep(
  db: Db,
  run: RunRow,
  step: StepRow,
  output: unknown,
  actorUserId: string | null,
) {
  const now = new Date();
  await db
    .update(schema.runSteps)
    .set({
      status: "succeeded",
      output: output as never,
      outputHash: hashValue(output),
      startedAt: step.startedAt ?? now,
      finishedAt: now,
    })
    .where(eq(schema.runSteps.id, step.id));
  await audit(db, {
    actorUserId,
    workspaceId: run.workspaceId,
    action: "run.step_completed",
    detail: { runId: run.id, step: step.key, type: step.type, outputHash: hashValue(output) },
  });
}

async function failStep(
  db: Db,
  run: RunRow,
  step: StepRow,
  code: string,
  actorUserId: string | null,
) {
  await db
    .update(schema.runSteps)
    .set({ status: "failed", errorCode: code, finishedAt: new Date() })
    .where(eq(schema.runSteps.id, step.id));
  await audit(db, {
    actorUserId,
    workspaceId: run.workspaceId,
    action: "run.step_failed",
    detail: { runId: run.id, step: step.key, errorCode: code },
  });
}

/** Terminal transition + cleanup: skip unfinished steps, cancel open approvals, close the quota reservation. */
async function endRun(
  deps: EngineDeps,
  db: Db,
  run: RunRow,
  to: "completed" | "failed" | "cancelled",
  actorUserId: string | null,
  errorCode?: string,
  executedSteps = 0,
) {
  await transition(db, run, to, actorUserId, { errorCode, completedAt: new Date() });
  await db
    .update(schema.runSteps)
    .set({ status: "skipped" })
    .where(
      and(
        eq(schema.runSteps.runId, run.id),
        inArray(schema.runSteps.status, ["pending", "awaiting_approval"]),
      ),
    );
  await db
    .update(schema.approvalRequests)
    .set({ status: "cancelled" })
    .where(
      and(eq(schema.approvalRequests.runId, run.id), eq(schema.approvalRequests.status, "pending")),
    );
  if (run.quotaReservationId) {
    if (to === "cancelled") await deps.quota.release(db, run.quotaReservationId);
    else {
      const all = await db
        .select({ status: schema.runSteps.status })
        .from(schema.runSteps)
        .where(eq(schema.runSteps.runId, run.id));
      await deps.quota.settle(db, run.quotaReservationId, {
        runs: 1,
        stepsSucceeded: all.filter((s) => s.status === "succeeded").length,
        stepsExecutedThisCall: executedSteps,
      });
    }
  }
}

// ---------------------------------------------------------------- cancel

export async function cancelRun(
  deps: EngineDeps,
  args: { workspaceId: string; userId: string; runId: string },
): Promise<{ run: RunInfo; replayed: boolean }> {
  if (!UUID.test(args.runId)) throw notFound();
  const replayed = await deps.db.transaction(async (tx) => {
    const [run] = await tx
      .select()
      .from(schema.workflowRuns)
      .where(
        and(
          eq(schema.workflowRuns.id, args.runId),
          eq(schema.workflowRuns.workspaceId, args.workspaceId),
        ),
      )
      .for("update");
    if (!run) throw notFound();
    if (run.status === "cancelled") return true;
    if (isTerminal(run.status))
      throw new EngineError(409, "invalid_transition", `Run is already ${run.status}`);
    await endRun(deps, tx, run, "cancelled", args.userId, "cancelled_by_user");
    return false;
  });
  return { run: await loadRunInfo(deps.db, args.workspaceId, args.runId), replayed };
}
