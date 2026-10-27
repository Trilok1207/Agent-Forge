import type { RunStatus } from "@agentflow/contracts";

/**
 * The only legal run-state transitions. Anything not listed is rejected by the
 * server, whatever the caller asks for. (docs/workflow-engine.md#run-states)
 */
export const RUN_TRANSITIONS: Readonly<Record<RunStatus, readonly RunStatus[]>> = {
  draft: ["planned", "cancelled"],
  planned: ["awaiting_plan_approval", "cancelled"],
  awaiting_plan_approval: ["queued", "cancelled"],
  queued: ["running", "cancelled"],
  running: ["awaiting_action_approval", "awaiting_local_step", "completed", "failed", "cancelled"],
  awaiting_action_approval: ["running", "cancelled"],
  awaiting_local_step: ["running", "failed", "cancelled"],
  completed: [],
  failed: [],
  cancelled: [],
};

export const TERMINAL_STATUSES: readonly RunStatus[] = ["completed", "failed", "cancelled"];

export const isTerminal = (s: RunStatus) => TERMINAL_STATUSES.includes(s);

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return RUN_TRANSITIONS[from].includes(to);
}

export class InvalidTransitionError extends Error {
  readonly code = "invalid_transition";
  constructor(
    readonly from: RunStatus,
    readonly to: RunStatus,
  ) {
    super(`Run cannot move from ${from} to ${to}`);
  }
}

export function assertTransition(from: RunStatus, to: RunStatus): void {
  if (!canTransition(from, to)) throw new InvalidTransitionError(from, to);
}
