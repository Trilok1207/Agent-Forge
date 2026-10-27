import { RunStatus, STEP_REGISTRY, type WorkflowSpec } from "@agentflow/contracts";
import { describe, expect, it } from "vitest";
import { canonicalJson, hashValue } from "./canonical";
import { demoWorkflowSpecs } from "./demo";
import { createMockExecutor } from "./executor";
import { topologicalOrder, validateSpec } from "./spec";
import {
  assertTransition,
  canTransition,
  InvalidTransitionError,
  RUN_TRANSITIONS,
  TERMINAL_STATUSES,
} from "./states";

const docs = () => structuredClone(demoWorkflowSpecs()[0]!.spec) as WorkflowSpec;

describe("run state machine", () => {
  const all = RunStatus.options;

  it("matches the documented transition table exactly", () => {
    expect(RUN_TRANSITIONS).toMatchInlineSnapshot(`
      {
        "awaiting_action_approval": [
          "running",
          "cancelled",
        ],
        "awaiting_local_step": [
          "running",
          "failed",
          "cancelled",
        ],
        "awaiting_plan_approval": [
          "queued",
          "cancelled",
        ],
        "cancelled": [],
        "completed": [],
        "draft": [
          "planned",
          "cancelled",
        ],
        "failed": [],
        "planned": [
          "awaiting_plan_approval",
          "cancelled",
        ],
        "queued": [
          "running",
          "cancelled",
        ],
        "running": [
          "awaiting_action_approval",
          "awaiting_local_step",
          "completed",
          "failed",
          "cancelled",
        ],
      }
    `);
  });

  it("rejects every pair not in the table (exhaustive)", () => {
    for (const from of all) {
      for (const to of all) {
        const allowed = RUN_TRANSITIONS[from].includes(to);
        expect(canTransition(from, to), `${from} -> ${to}`).toBe(allowed);
        if (!allowed) expect(() => assertTransition(from, to)).toThrow(InvalidTransitionError);
      }
    }
  });

  it("terminal states have no exits, and nothing skips plan approval", () => {
    for (const t of TERMINAL_STATUSES) expect(RUN_TRANSITIONS[t]).toEqual([]);
    for (const from of all) {
      if (
        from !== "queued" &&
        from !== "awaiting_action_approval" &&
        from !== "awaiting_local_step"
      ) {
        expect(canTransition(from, "running"), `${from} -> running`).toBe(false);
      }
    }
    expect(canTransition("planned", "queued")).toBe(false);
    expect(canTransition("awaiting_plan_approval", "running")).toBe(false);
    expect(canTransition("awaiting_action_approval", "completed")).toBe(false);
  });
});

describe("validateSpec", () => {
  it("accepts all demo specs with a deterministic order", () => {
    for (const { spec } of demoWorkflowSpecs()) {
      const r = validateSpec(spec);
      expect(r.ok, JSON.stringify(r)).toBe(true);
      if (r.ok) expect(r.order).toEqual(spec.steps.map((s) => s.id));
    }
  });

  it("orders by dependencies, ties by declaration order", () => {
    const spec = docs();
    spec.steps.reverse();
    const r = validateSpec(spec);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.order).toEqual(["read", "extract", "summarize", "preview", "save"]);
  });

  it.each([
    ["cycle", (s: WorkflowSpec) => (s.steps[0]!.dependsOn = ["save"]), "dependency cycle"],
    [
      "self dependency",
      (s: WorkflowSpec) => (s.steps[1]!.dependsOn = ["summarize"]),
      "depends on itself",
    ],
    [
      "unknown dependency",
      (s: WorkflowSpec) => (s.steps[1]!.dependsOn = ["ghost"]),
      "unknown dependency",
    ],
    ["duplicate id", (s: WorkflowSpec) => (s.steps[2]!.id = "summarize"), "duplicate step id"],
    [
      "effect without approval",
      (s: WorkflowSpec) => (s.steps[4]!.requiresApproval = false),
      "must require approval",
    ],
    [
      "write without preview",
      (s: WorkflowSpec) => (s.steps[4]!.dependsOn = ["summarize"]),
      "after a review.preview",
    ],
    [
      "unknown step type",
      (s: WorkflowSpec) => ((s.steps[0] as { type: string }).type = "local.run_shell"),
      "type",
    ],
    [
      "extra key on step",
      (s: WorkflowSpec) => Object.assign(s.steps[0]!, { command: "rm -rf /" }),
      "command",
    ],
    [
      "extra key on spec",
      (s: WorkflowSpec) => Object.assign(s, { webhook: "https://x" }),
      "webhook",
    ],
    ["bad step id", (s: WorkflowSpec) => (s.steps[0]!.id = "../etc"), "steps.0.id"],
    ["no steps", (s: WorkflowSpec) => (s.steps = []), "steps"],
  ])("rejects %s", (_name, mutate, expected) => {
    const spec = docs();
    mutate(spec);
    const r = validateSpec(spec);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.join("\n")).toContain(expected);
  });

  it("rejects non-objects", () => {
    for (const v of [null, 1, "x", [], { schemaVersion: 2 }])
      expect(validateSpec(v).ok).toBe(false);
  });

  it("topologicalOrder returns null for cycles", () => {
    const spec = docs();
    spec.steps[0]!.dependsOn = ["preview"];
    expect(topologicalOrder(spec.steps)).toBeNull();
  });
});

describe("canonical hashing", () => {
  it("is independent of key order and drops undefined", () => {
    expect(canonicalJson({ b: 1, a: { d: [2, { y: 1, x: 2 }], c: undefined } })).toBe(
      '{"a":{"d":[2,{"x":2,"y":1}]},"b":1}',
    );
    expect(hashValue({ a: 1, b: 2 })).toBe(hashValue({ b: 2, a: 1 }));
    expect(hashValue({ a: 1 })).not.toBe(hashValue({ a: 2 }));
  });
});

describe("mock executor", () => {
  function runAll(spec: WorkflowSpec) {
    const ex = createMockExecutor();
    const outputs: Record<string, unknown> = {};
    const proposals: Record<string, string> = {};
    for (const step of spec.steps) {
      const ctx = { spec, input: {}, outputs };
      if (STEP_REGISTRY[step.type].effect === "none") outputs[step.id] = ex.run(step, ctx);
      else proposals[step.id] = hashValue(ex.proposeAction(step, ctx));
    }
    return { outputs: hashValue(outputs), proposals };
  }

  it("is deterministic across runs for every demo spec", () => {
    for (const { spec } of demoWorkflowSpecs())
      expect(runAll(spec)).toEqual(runAll(structuredClone(spec)));
  });

  it("only simulates actions and refuses to run side-effecting steps directly", () => {
    const spec = docs();
    const ex = createMockExecutor();
    const save = spec.steps.find((s) => s.type === "local.save_file")!;
    expect(() => ex.run(save, { spec, input: {}, outputs: {} })).toThrow(/not a read-only step/);
    const proposal = ex.proposeAction(save, { spec, input: {}, outputs: {} });
    expect(proposal.destination).toMatch(/nothing is written/);
    expect(ex.performAction(save, { spec, input: {}, outputs: {} }, proposal)).toMatchObject({
      simulated: true,
      written: false,
    });
  });
});
