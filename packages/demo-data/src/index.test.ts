import { WorkflowPlan, STEP_REGISTRY } from "@agentflow/contracts";
import { describe, expect, it } from "vitest";
import { demoProject } from "./index";

describe("demo project", () => {
  it.each(demoProject.scenarios.map((s) => [s.kind, s] as const))(
    "%s plan is a valid WorkflowPlan",
    (_k, s) => {
      const parsed = WorkflowPlan.safeParse(s.plan);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
      expect(s.plan.kind).toBe(s.kind);
      expect(s.result.type).toBe(s.kind);
    },
  );

  it("gates every side-effecting step behind approval", () => {
    for (const s of demoProject.scenarios) {
      for (const step of s.plan.steps) {
        if (STEP_REGISTRY[step.type].effect !== "none") expect(step.requiresApproval).toBe(true);
      }
    }
  });

  it("uses only synthetic example domains and no local paths (B12)", () => {
    const text = JSON.stringify(demoProject);
    expect(text).not.toMatch(/[A-Za-z]:\\\\|\/home\/|\/Users\//);
    const emails = text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) ?? [];
    for (const e of emails) expect(e).toMatch(/\.example$/);
  });
});
