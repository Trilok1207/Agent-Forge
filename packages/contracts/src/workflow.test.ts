import { describe, expect, it } from "vitest";
import { STEP_REGISTRY, WorkflowPlan } from "./workflow";

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

const basePlan = {
  schemaVersion: 1,
  id: "plan_1",
  kind: "documents",
  request: "Summarize these files",
  summary: "Read, summarize, preview, save",
  steps: [
    {
      id: "read",
      type: "local.read_grant",
      title: "Read",
      grantIds: ["g1"],
      requiresApproval: false,
    },
    {
      id: "sum",
      type: "model.summarize",
      title: "Summarize",
      dependsOn: ["read"],
      requiresApproval: false,
    },
    {
      id: "save",
      type: "local.save_file",
      title: "Save",
      dependsOn: ["sum"],
      requiresApproval: true,
    },
  ],
} as const;

describe("step registry", () => {
  it("matches the approved V1 registry exactly (B6)", () => {
    expect(STEP_REGISTRY).toMatchInlineSnapshot(`
      {
        "client.copy_to_clipboard": {
          "effect": "local_write",
          "location": "client",
        },
        "input.pasted_text": {
          "effect": "none",
          "location": "client",
        },
        "local.apply_patch": {
          "effect": "local_write",
          "location": "desktop",
        },
        "local.export_patch": {
          "effect": "local_write",
          "location": "desktop",
        },
        "local.read_grant": {
          "effect": "none",
          "location": "desktop",
        },
        "local.repo_snapshot": {
          "effect": "none",
          "location": "desktop",
        },
        "local.save_file": {
          "effect": "local_write",
          "location": "desktop",
        },
        "model.analyze_code": {
          "effect": "none",
          "location": "cloud",
        },
        "model.classify": {
          "effect": "none",
          "location": "cloud",
        },
        "model.draft_reply": {
          "effect": "none",
          "location": "cloud",
        },
        "model.extract": {
          "effect": "none",
          "location": "cloud",
        },
        "model.propose_diff": {
          "effect": "none",
          "location": "cloud",
        },
        "model.summarize": {
          "effect": "none",
          "location": "cloud",
        },
        "review.preview": {
          "effect": "none",
          "location": "client",
        },
      }
    `);
  });

  it("contains no shell, network, git-write, or send capability (B6)", () => {
    for (const type of Object.keys(STEP_REGISTRY)) {
      expect(type).not.toMatch(/shell|exec|command|process|http|fetch|send|smtp|commit|push|git/i);
    }
  });
});

describe("WorkflowPlan", () => {
  it("accepts a valid plan", () => {
    expect(WorkflowPlan.safeParse(basePlan).success).toBe(true);
  });

  it("rejects an effectful step without approval (B5)", () => {
    const plan = clone(basePlan) as unknown as { steps: { requiresApproval: boolean }[] };
    plan.steps[2]!.requiresApproval = false;
    expect(WorkflowPlan.safeParse(plan).success).toBe(false);
  });

  it("rejects unknown step types (B5)", () => {
    const plan = clone(basePlan) as unknown as { steps: { type: string }[] };
    plan.steps[0]!.type = "local.run_shell";
    expect(WorkflowPlan.safeParse(plan).success).toBe(false);
  });

  it("rejects dangling dependencies", () => {
    const plan = clone(basePlan) as unknown as { steps: { dependsOn: string[] }[] };
    plan.steps[1]!.dependsOn = ["missing"];
    expect(WorkflowPlan.safeParse(plan).success).toBe(false);
  });
});
