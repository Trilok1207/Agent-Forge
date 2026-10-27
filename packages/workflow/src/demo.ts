import type { WorkflowSpec } from "@agentflow/contracts";
import { demoProject } from "@agentflow/demo-data";

/** The three demo plans as stored workflow specs (seeded into every workspace). */
export function demoWorkflowSpecs(): { key: string; name: string; spec: WorkflowSpec }[] {
  return demoProject.scenarios.map((s) => ({
    key: `demo-${s.kind}`,
    name: `Demo: ${s.label}`,
    spec: {
      schemaVersion: 1,
      kind: s.kind,
      name: `Demo: ${s.label}`,
      description: s.plan.summary,
      steps: s.plan.steps.map((st) => ({ ...st })),
    },
  }));
}
