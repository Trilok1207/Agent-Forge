import { z } from "zod";
import { WorkflowSpec } from "./engine";
import { ExecutionLocation, Effect, StepType, WorkflowKind } from "./workflow";

export const ModelMode = z.enum(["hosted", "byok"]);
export type ModelMode = z.infer<typeof ModelMode>;

export const PlanRequest = z
  .object({
    request: z.string().trim().min(1).max(2000),
    kind: WorkflowKind.optional(),
    mode: ModelMode.default("hosted"),
  })
  .strict();
export type PlanRequest = z.infer<typeof PlanRequest>;

export const PlanDraftInfo = z.object({
  id: z.string().uuid(),
  status: z.enum(["ready", "accepted", "discarded"]),
  request: z.string(),
  spec: WorkflowSpec,
  specHash: z.string().regex(/^[0-9a-f]{64}$/),
  /** Plain-language review rows: where each step runs and whether it writes. */
  review: z.array(
    z.object({
      id: z.string(),
      type: StepType,
      title: z.string(),
      location: ExecutionLocation,
      effect: Effect,
      requiresApproval: z.boolean(),
    }),
  ),
  provider: z.string(),
  mode: ModelMode,
  workflowId: z.string().uuid().nullable(),
  createdAt: z.string(),
});
export type PlanDraftInfo = z.infer<typeof PlanDraftInfo>;
export const PlanListResponse = z.object({ plans: z.array(PlanDraftInfo) });

/** Accepting is bound to the exact spec the user reviewed. */
export const AcceptPlanRequest = z
  .object({ specHash: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();

export const ModelKeyInfo = z.object({
  provider: z.string(),
  last4: z.string(),
  createdAt: z.string(),
});
export type ModelKeyInfo = z.infer<typeof ModelKeyInfo>;

export const PutModelKeyRequest = z.object({ apiKey: z.string().min(8).max(512) }).strict();

export const ModelStatusResponse = z.object({
  defaultProvider: z.string(),
  providers: z.array(z.object({ id: z.string(), hosted: z.boolean(), byok: z.boolean() })),
  byokAvailable: z.boolean(),
  keys: z.array(ModelKeyInfo),
});
export type ModelStatusResponse = z.infer<typeof ModelStatusResponse>;
