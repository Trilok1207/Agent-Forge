import { PlanRequest, STEP_REGISTRY, type PlanDraftInfo } from "@agentflow/contracts";
import { and, desc, eq, schema, type Db } from "@agentflow/db";
import { ModelError } from "@agentflow/models";
import {
  buildPlannerMessages,
  hashValue,
  MAX_PLANNER_OUTPUT_TOKENS,
  parsePlannerOutput,
  validateSpec,
} from "@agentflow/workflow";
import { audit } from "../audit";
import { EngineError, notFound } from "../engine/errors";
import { createWorkflow } from "../engine/workflows";
import type { ModelsDeps } from "./setup";

type DraftRow = typeof schema.planDrafts.$inferSelect;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9_.:-]{8,128}$/;

/** Model failures → client-safe errors. Messages are fixed strings, never provider text. */
const MODEL_ERROR_STATUS: Record<ModelError["kind"], [400 | 422 | 429 | 502 | 503 | 504, string]> =
  {
    quota_exceeded: [429, "quota_exceeded"],
    timeout: [504, "model_timeout"],
    unavailable: [503, "model_unavailable"],
    rate_limited: [503, "model_unavailable"],
    not_configured: [503, "model_not_configured"],
    auth: [502, "model_auth_failed"],
    bad_request: [502, "model_rejected_request"],
    input_too_large: [422, "input_too_large"],
    output_too_large: [422, "plan_invalid"],
    invalid_response: [422, "plan_invalid"],
  };

export function draftInfo(d: DraftRow): PlanDraftInfo {
  return {
    id: d.id,
    status: d.status,
    request: d.requestText,
    spec: d.spec,
    specHash: d.specHash,
    review: d.spec.steps.map((s) => ({
      id: s.id,
      type: s.type,
      title: s.title,
      ...STEP_REGISTRY[s.type],
      requiresApproval: s.requiresApproval,
    })),
    provider: d.provider,
    mode: d.mode,
    workflowId: d.workflowId,
    createdAt: d.createdAt.toISOString(),
  };
}

async function loadDraft(db: Db, workspaceId: string, id: string) {
  if (!UUID.test(id)) throw notFound();
  const [d] = await db
    .select()
    .from(schema.planDrafts)
    .where(and(eq(schema.planDrafts.id, id), eq(schema.planDrafts.workspaceId, workspaceId)));
  if (!d) throw notFound();
  return d;
}

/**
 * Natural language → validated plan draft. The model's text is parsed and
 * validated server-side and stored as a draft for review. It never creates a
 * workflow, starts a run, or calls a tool (ADR-024).
 */
export async function createPlan(
  db: Db,
  models: ModelsDeps,
  args: { workspaceId: string; userId: string; idempotencyKey: string | undefined; body: unknown },
): Promise<{ plan: PlanDraftInfo; replayed: boolean }> {
  if (!args.idempotencyKey || !IDEMPOTENCY_KEY.test(args.idempotencyKey)) {
    throw new EngineError(
      400,
      "idempotency_key_required",
      "Send an Idempotency-Key header (8-128 chars of [A-Za-z0-9_.:-])",
    );
  }
  const parsed = PlanRequest.safeParse(args.body);
  if (!parsed.success) {
    throw new EngineError(
      422,
      "invalid_request",
      "Invalid plan request",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    );
  }
  const body = parsed.data;
  const requestHash = hashValue(body);
  const findExisting = async () => {
    const [d] = await db
      .select()
      .from(schema.planDrafts)
      .where(
        and(
          eq(schema.planDrafts.workspaceId, args.workspaceId),
          eq(schema.planDrafts.createdBy, args.userId),
          eq(schema.planDrafts.idempotencyKey, args.idempotencyKey!),
        ),
      );
    if (!d) return null;
    if (d.requestHash !== requestHash) {
      throw new EngineError(
        422,
        "idempotency_key_reused",
        "This Idempotency-Key was already used with a different request",
      );
    }
    return { plan: draftInfo(d), replayed: true };
  };
  const existing = await findExisting();
  if (existing) return existing;

  const messages = buildPlannerMessages(body.request, body.kind);
  let text: string;
  let usage: { inputTokens: number; outputTokens: number; attempts: number };
  try {
    const result = await models.gateway.generate({
      workspaceId: args.workspaceId,
      userId: args.userId,
      providerId: models.defaultProvider,
      mode: body.mode,
      request: {
        purpose: "plan",
        system: messages.system,
        messages: [{ role: "user", content: messages.user }],
        maxOutputTokens: MAX_PLANNER_OUTPUT_TOKENS,
        responseFormat: "json",
      },
    });
    text = result.response.text;
    usage = { ...result.response.usage, attempts: result.attempts };
  } catch (e) {
    if (!(e instanceof ModelError)) throw e;
    await audit(db, {
      actorUserId: args.userId,
      workspaceId: args.workspaceId,
      action: "plan.model_failed",
      detail: { kind: e.kind, mode: body.mode },
    });
    const [status, code] = MODEL_ERROR_STATUS[e.kind];
    throw new EngineError(status, code, e.message);
  }

  // Untrusted model output: strict parse + validation, fail closed, no repair.
  const plan = parsePlannerOutput(text, body.kind);
  if (!plan.ok) {
    await audit(db, {
      actorUserId: args.userId,
      workspaceId: args.workspaceId,
      action: "plan.rejected",
      detail: { issues: plan.issues.length, mode: body.mode },
    });
    throw new EngineError(
      422,
      "plan_invalid",
      "The model did not produce a valid plan. Nothing was saved or run.",
      plan.issues,
    );
  }

  try {
    const [row] = await db
      .insert(schema.planDrafts)
      .values({
        workspaceId: args.workspaceId,
        createdBy: args.userId,
        idempotencyKey: args.idempotencyKey,
        requestHash,
        requestText: body.request,
        spec: plan.spec,
        specHash: hashValue(plan.spec),
        provider: models.defaultProvider,
        mode: body.mode,
        usage,
      })
      .returning();
    await audit(db, {
      actorUserId: args.userId,
      workspaceId: args.workspaceId,
      action: "plan.generated",
      detail: {
        draftId: row!.id,
        provider: models.defaultProvider,
        mode: body.mode,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      },
    });
    return { plan: draftInfo(row!), replayed: false };
  } catch (e) {
    const err = e as { code?: string; cause?: { code?: string } };
    if (err?.code === "23505" || err?.cause?.code === "23505") {
      const again = await findExisting();
      if (again) return again;
    }
    throw e;
  }
}

export async function listPlans(db: Db, workspaceId: string) {
  const rows = await db
    .select()
    .from(schema.planDrafts)
    .where(eq(schema.planDrafts.workspaceId, workspaceId))
    .orderBy(desc(schema.planDrafts.createdAt))
    .limit(50);
  return rows.map(draftInfo);
}

export async function getPlan(db: Db, workspaceId: string, id: string) {
  return draftInfo(await loadDraft(db, workspaceId, id));
}

/**
 * The user's review decision, bound to the spec hash they saw. Accepting
 * creates a workflow definition only; running it still needs a run, a plan
 * approval, and per-action approvals.
 */
export async function acceptPlan(
  db: Db,
  args: { workspaceId: string; userId: string; id: string; specHash: string },
) {
  return db.transaction(async (tx) => {
    const d = await loadDraft(tx, args.workspaceId, args.id);
    const [locked] = await tx
      .select()
      .from(schema.planDrafts)
      .where(eq(schema.planDrafts.id, d.id))
      .for("update");
    if (locked!.status === "accepted") return { plan: draftInfo(locked!), replayed: true };
    if (locked!.status !== "ready")
      throw new EngineError(409, "plan_not_ready", `Plan is ${locked!.status}`);
    if (args.specHash !== locked!.specHash)
      throw new EngineError(
        409,
        "content_hash_mismatch",
        "The plan changed since you reviewed it; reload it",
      );
    // Re-validate the stored spec (defence in depth against tampering).
    const checked = validateSpec(locked!.spec);
    if (!checked.ok || hashValue(checked.spec) !== locked!.specHash)
      throw new EngineError(409, "plan_invalid", "Stored plan failed validation");
    const workflowId = await createWorkflow(tx, {
      workspaceId: args.workspaceId,
      userId: args.userId,
      key: `plan-${locked!.id.slice(0, 8)}`,
      name: checked.spec.name,
      spec: checked.spec,
    });
    const [row] = await tx
      .update(schema.planDrafts)
      .set({ status: "accepted", workflowId, decidedAt: new Date() })
      .where(and(eq(schema.planDrafts.id, locked!.id), eq(schema.planDrafts.status, "ready")))
      .returning();
    await audit(tx, {
      actorUserId: args.userId,
      workspaceId: args.workspaceId,
      action: "plan.accepted",
      detail: { draftId: locked!.id, workflowId, specHash: locked!.specHash },
    });
    return { plan: draftInfo(row!), replayed: false };
  });
}

export async function discardPlan(
  db: Db,
  args: { workspaceId: string; userId: string; id: string },
) {
  return db.transaction(async (tx) => {
    const d = await loadDraft(tx, args.workspaceId, args.id);
    if (d.status === "discarded") return { plan: draftInfo(d), replayed: true };
    if (d.status !== "ready") throw new EngineError(409, "plan_not_ready", `Plan is ${d.status}`);
    const [row] = await tx
      .update(schema.planDrafts)
      .set({ status: "discarded", decidedAt: new Date() })
      .where(and(eq(schema.planDrafts.id, d.id), eq(schema.planDrafts.status, "ready")))
      .returning();
    if (!row) throw new EngineError(409, "plan_not_ready", "Plan was decided concurrently");
    await audit(tx, {
      actorUserId: args.userId,
      workspaceId: args.workspaceId,
      action: "plan.discarded",
      detail: { draftId: d.id },
    });
    return { plan: draftInfo(row), replayed: false };
  });
}
