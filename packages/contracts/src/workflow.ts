import { z } from "zod";

/** Where a step executes. See docs/architecture.md#step-registry-v1. */
export const ExecutionLocation = z.enum(["cloud", "desktop", "client"]);
export type ExecutionLocation = z.infer<typeof ExecutionLocation>;

/**
 * Side-effect class. Anything other than "none" requires an explicit user
 * approval bound to a content hash (ADR-007).
 */
export const Effect = z.enum(["none", "local_write"]);
export type Effect = z.infer<typeof Effect>;

/**
 * The fixed V1 step registry. There are deliberately no shell, network,
 * git-write, or email-send steps (threat model B6). Adding an entry needs an
 * ADR and a threat-model row.
 */
export const STEP_REGISTRY = {
  "local.read_grant": { location: "desktop", effect: "none" },
  "local.repo_snapshot": { location: "desktop", effect: "none" },
  "input.pasted_text": { location: "client", effect: "none" },
  "model.summarize": { location: "cloud", effect: "none" },
  "model.extract": { location: "cloud", effect: "none" },
  "model.classify": { location: "cloud", effect: "none" },
  "model.draft_reply": { location: "cloud", effect: "none" },
  "model.analyze_code": { location: "cloud", effect: "none" },
  "model.propose_diff": { location: "cloud", effect: "none" },
  "review.preview": { location: "client", effect: "none" },
  "local.save_file": { location: "desktop", effect: "local_write" },
  "local.apply_patch": { location: "desktop", effect: "local_write" },
  "local.export_patch": { location: "desktop", effect: "local_write" },
  "client.copy_to_clipboard": { location: "client", effect: "local_write" },
} as const satisfies Record<string, { location: ExecutionLocation; effect: Effect }>;

export type StepType = keyof typeof STEP_REGISTRY;
export const StepType = z.enum(Object.keys(STEP_REGISTRY) as [StepType, ...StepType[]]);

export const WorkflowKind = z.enum(["documents", "email", "repository"]);
export type WorkflowKind = z.infer<typeof WorkflowKind>;

export const WorkflowStep = z
  .object({
    id: z.string().min(1),
    type: StepType,
    title: z.string().min(1),
    dependsOn: z.array(z.string()).default([]),
    /** Opaque grant IDs only — the cloud never handles local paths (B1). */
    grantIds: z.array(z.string()).default([]),
    requiresApproval: z.boolean(),
  })
  .refine((s) => STEP_REGISTRY[s.type].effect === "none" || s.requiresApproval, {
    message: "Steps with side effects must require approval",
    path: ["requiresApproval"],
  });
export type WorkflowStep = z.infer<typeof WorkflowStep>;

export const WorkflowPlan = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().min(1),
    kind: WorkflowKind,
    request: z.string().min(1),
    summary: z.string().min(1),
    steps: z.array(WorkflowStep).min(1).max(20),
  })
  .refine(
    (p) => {
      const ids = new Set(p.steps.map((s) => s.id));
      return (
        ids.size === p.steps.length && p.steps.every((s) => s.dependsOn.every((d) => ids.has(d)))
      );
    },
    { message: "Step ids must be unique and dependencies must exist", path: ["steps"] },
  );
export type WorkflowPlan = z.infer<typeof WorkflowPlan>;

export function stepInfo(type: StepType) {
  return STEP_REGISTRY[type];
}
