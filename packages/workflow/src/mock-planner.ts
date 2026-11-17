import type { WorkflowKind } from "@agentflow/contracts";
import { demoWorkflowSpecs } from "./demo";

/**
 * Deterministic stand-in for a model in development (no provider approved
 * yet, decision D2). Picks a kind from keywords and returns the matching demo
 * plan as JSON text, exactly like a well-behaved model would.
 */
export function mockPlannerResponse(userMessage: string): string {
  const body = /<user_request>\n([\s\S]*)\n<\/user_request>/.exec(userMessage)?.[1] ?? "";
  const chosen = /kind: (documents|email|repository)\./.exec(userMessage)?.[1] as
    WorkflowKind | undefined;
  const lower = body.toLowerCase();
  const kind: WorkflowKind =
    chosen ??
    (/\b(email|emails|inbox|reply|replies|messages?)\b/.test(lower)
      ? "email"
      : /\b(repo|repository|code|bugs?|diff|patch|refactor)\b/.test(lower)
        ? "repository"
        : "documents");
  const demo = demoWorkflowSpecs().find((d) => d.spec.kind === kind)!;
  return JSON.stringify({
    kind,
    name: `Plan: ${kind}`,
    description: demo.spec.description,
    steps: demo.spec.steps.map(({ id, type, title, dependsOn }) => ({
      id,
      type,
      title,
      dependsOn,
    })),
  });
}
