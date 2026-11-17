import type { StepType, WorkflowKind } from "@agentflow/contracts";

/**
 * Which registry steps each V1 workflow kind may use. A documents workflow
 * can't apply patches; an email workflow can't read local files; nothing can
 * do what the registry doesn't offer.
 */
export const KIND_STEP_POLICY: Readonly<Record<WorkflowKind, readonly StepType[]>> = {
  documents: [
    "local.read_grant",
    "model.summarize",
    "model.extract",
    "review.preview",
    "local.save_file",
  ],
  email: [
    "input.pasted_text",
    "model.summarize",
    "model.classify",
    "model.draft_reply",
    "review.preview",
    "client.copy_to_clipboard",
    "local.save_file",
  ],
  repository: [
    "local.repo_snapshot",
    "model.analyze_code",
    "model.propose_diff",
    "review.preview",
    "local.export_patch",
    "local.apply_patch",
  ],
};
