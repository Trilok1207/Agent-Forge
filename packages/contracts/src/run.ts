import { z } from "zod";

/** Run lifecycle (docs/architecture.md#run-state-machine). Only the API transitions it. */
export const RunStatus = z.enum([
  "draft",
  "planned",
  "awaiting_plan_approval",
  "queued",
  "running",
  "awaiting_local_step",
  "awaiting_action_approval",
  "completed",
  "failed",
  "cancelled",
]);
export type RunStatus = z.infer<typeof RunStatus>;
