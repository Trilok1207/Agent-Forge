import { STEP_REGISTRY, WorkflowSpec, type WorkflowStep } from "@agentflow/contracts";

export type SpecValidation =
  { ok: true; spec: WorkflowSpec; order: string[] } | { ok: false; issues: string[] };

/**
 * Server-side validation of a workflow definition, beyond the schema:
 * unique step ids, existing dependencies, no cycles, approval on every
 * side-effecting step, and a preview step before any write ("preview before
 * saving"). Returns a deterministic execution order.
 */
export function validateSpec(input: unknown): SpecValidation {
  const parsed = WorkflowSpec.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "spec"}: ${i.message}`),
    };
  }
  const spec = parsed.data;
  const issues: string[] = [];
  const byId = new Map<string, WorkflowStep>();
  for (const step of spec.steps) {
    if (byId.has(step.id)) issues.push(`steps: duplicate step id "${step.id}"`);
    byId.set(step.id, step);
  }
  for (const step of spec.steps) {
    for (const dep of step.dependsOn) {
      if (dep === step.id) issues.push(`steps.${step.id}: depends on itself`);
      else if (!byId.has(dep)) issues.push(`steps.${step.id}: unknown dependency "${dep}"`);
    }
  }
  if (issues.length) return { ok: false, issues };

  const order = topologicalOrder(spec.steps);
  if (!order) return { ok: false, issues: ["steps: dependency cycle"] };

  for (const step of spec.steps) {
    if (STEP_REGISTRY[step.type].effect === "none") continue;
    // Effect comes from the registry, never from the caller (requiresApproval is double-checked here too).
    if (!step.requiresApproval)
      issues.push(`steps.${step.id}: side-effecting step must require approval`);
    const ancestors = ancestorsOf(step.id, byId);
    if (![...ancestors].some((a) => byId.get(a)!.type === "review.preview")) {
      issues.push(`steps.${step.id}: side-effecting step must come after a review.preview step`);
    }
  }
  return issues.length ? { ok: false, issues } : { ok: true, spec, order };
}

/** Kahn's algorithm; ties broken by declaration order so the result is deterministic. Null on cycles. */
export function topologicalOrder(steps: readonly WorkflowStep[]): string[] | null {
  const indegree = new Map(steps.map((s) => [s.id, s.dependsOn.length]));
  const order: string[] = [];
  const done = new Set<string>();
  while (order.length < steps.length) {
    const next = steps.find((s) => !done.has(s.id) && indegree.get(s.id) === 0);
    if (!next) return null;
    done.add(next.id);
    order.push(next.id);
    for (const s of steps)
      if (s.dependsOn.includes(next.id)) indegree.set(s.id, indegree.get(s.id)! - 1);
  }
  return order;
}

function ancestorsOf(id: string, byId: Map<string, WorkflowStep>): Set<string> {
  const seen = new Set<string>();
  const stack = [...byId.get(id)!.dependsOn];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    stack.push(...byId.get(cur)!.dependsOn);
  }
  return seen;
}
