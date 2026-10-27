import { z } from "zod";
import { RunStatus } from "./run";
import { StepType, WorkflowKind, WorkflowStep } from "./workflow";

/**
 * A stored, versioned workflow definition. Same step model as planner output
 * (WorkflowPlan) so a future visual builder edits the same shape. Unknown keys
 * are rejected. Graph rules (acyclic, unique ids) are enforced by
 * `validateSpec` in @agentflow/workflow on the server.
 */
export const WorkflowSpec = z
  .object({
    schemaVersion: z.literal(1),
    kind: WorkflowKind,
    name: z.string().min(1).max(120),
    description: z.string().max(1000).default(""),
    steps: z.array(WorkflowStep).min(1).max(20),
  })
  .strict();
export type WorkflowSpec = z.infer<typeof WorkflowSpec>;

export const StepStatus = z.enum([
  "pending",
  "awaiting_approval",
  "succeeded",
  "failed",
  "rejected",
  "skipped",
]);
export type StepStatus = z.infer<typeof StepStatus>;

export const ApprovalKind = z.enum(["plan", "action"]);
export type ApprovalKind = z.infer<typeof ApprovalKind>;

export const ApprovalStatus = z.enum(["pending", "approved", "rejected", "cancelled"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatus>;

const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, "sha256 hex");

/** Run input. Small and typed: no file paths, no free-form commands. */
export const RunInput = z
  .object({
    projectId: z.string().uuid().optional(),
    note: z.string().max(2000).optional(),
  })
  .strict();
export type RunInput = z.infer<typeof RunInput>;

export const WorkflowKey = z.string().regex(/^[a-z][a-z0-9-]{1,63}$/, "lowercase slug");

export const CreateWorkflowRequest = z
  .object({ key: WorkflowKey, name: z.string().min(1).max(120), spec: z.unknown() })
  .strict();
export type CreateWorkflowRequest = z.infer<typeof CreateWorkflowRequest>;

export const CreateVersionRequest = z.object({ spec: z.unknown() }).strict();

export const CreateRunRequest = z
  .object({
    workflowId: z.string().uuid(),
    /** Defaults to the latest version. */
    version: z.number().int().positive().optional(),
    input: RunInput.default({}),
  })
  .strict();
export type CreateRunRequest = z.infer<typeof CreateRunRequest>;

/**
 * Approving requires echoing the hash of the exact content that was shown
 * (ADR-007); a stale or tampered view cannot be approved.
 */
export const ApprovalDecisionRequest = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("approve"), contentHash: Sha256Hex }).strict(),
  z.object({ decision: z.literal("reject"), reason: z.string().max(500).optional() }).strict(),
]);
export type ApprovalDecisionRequest = z.infer<typeof ApprovalDecisionRequest>;

export const WorkflowVersionInfo = z.object({
  id: z.string().uuid(),
  version: z.number().int(),
  specHash: Sha256Hex,
  spec: WorkflowSpec,
  createdAt: z.string(),
});
export type WorkflowVersionInfo = z.infer<typeof WorkflowVersionInfo>;

export const WorkflowInfo = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  kind: WorkflowKind,
  isDemo: z.boolean(),
  latestVersion: z.number().int(),
  createdAt: z.string(),
});
export type WorkflowInfo = z.infer<typeof WorkflowInfo>;
export const WorkflowListResponse = z.object({ workflows: z.array(WorkflowInfo) });
export const WorkflowDetail = WorkflowInfo.extend({ versions: z.array(WorkflowVersionInfo) });
export type WorkflowDetail = z.infer<typeof WorkflowDetail>;

export const RunStepInfo = z.object({
  id: z.string().uuid(),
  key: z.string(),
  position: z.number().int(),
  type: StepType,
  title: z.string(),
  status: StepStatus,
  output: z.unknown().nullable(),
  outputHash: Sha256Hex.nullable(),
  errorCode: z.string().nullable(),
});
export type RunStepInfo = z.infer<typeof RunStepInfo>;

export const ApprovalInfo = z.object({
  id: z.string().uuid(),
  kind: ApprovalKind,
  stepKey: z.string().nullable(),
  status: ApprovalStatus,
  title: z.string(),
  destination: z.string().nullable(),
  /** The exact content being approved (plan JSON or proposed write). */
  content: z.string(),
  contentHash: Sha256Hex,
  requestedAt: z.string(),
  decidedAt: z.string().nullable(),
});
export type ApprovalInfo = z.infer<typeof ApprovalInfo>;

export const RunInfo = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  workflowId: z.string().uuid(),
  versionId: z.string().uuid(),
  version: z.number().int(),
  status: RunStatus,
  stateVersion: z.number().int(),
  input: RunInput,
  errorCode: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  steps: z.array(RunStepInfo),
  approvals: z.array(ApprovalInfo),
});
export type RunInfo = z.infer<typeof RunInfo>;
export const RunListResponse = z.object({
  runs: z.array(RunInfo.omit({ steps: true, approvals: true })),
});
