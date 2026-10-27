import type { RunInput, WorkflowSpec, WorkflowStep } from "@agentflow/contracts";
import { demoProject, type DemoScenario } from "@agentflow/demo-data";
import { hashValue } from "./canonical";

export interface StepContext {
  spec: WorkflowSpec;
  input: RunInput;
  /** Outputs of already-completed steps, keyed by step id. */
  outputs: Readonly<Record<string, unknown>>;
}

/** What a side-effecting step would do. Its content is what the user approves (hash-bound). */
export interface ActionProposal {
  title: string;
  destination: string;
  content: string;
}

/**
 * Executes steps. Implementations must be deterministic for a given
 * (spec, input, prior outputs) so content hashes are stable between preview
 * and approval.
 */
export interface StepExecutor {
  /** Runs a step with no side effects and returns its JSON output. Throw to fail the step. */
  run(step: WorkflowStep, ctx: StepContext): unknown;
  /** Describes the write a side-effecting step would perform. Must not perform it. */
  proposeAction(step: WorkflowStep, ctx: StepContext): ActionProposal;
  /** Performs an approved action. The engine has already verified the approval and content hash. */
  performAction(step: WorkflowStep, ctx: StepContext, proposal: ActionProposal): unknown;
}

const MOCK_DESTINATION = "Location chosen at approval time (mock mode: nothing is written)";

function scenarioFor(spec: WorkflowSpec): DemoScenario {
  return demoProject.scenarios.find((s) => s.kind === spec.kind)!;
}

function reportFor(s: DemoScenario): string {
  const r = s.result;
  if (r.type === "documents") {
    const head = `| ${r.table.columns.join(" | ")} |\n| ${r.table.columns.map(() => "---").join(" | ")} |`;
    const rows = r.table.rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
    return `# Summary\n\n${r.summary.map((l) => `- ${l}`).join("\n")}\n\n${head}\n${rows}\n`;
  }
  if (r.type === "repository") return `${r.diff}\n`;
  return r.messages.find((m) => m.draft)?.draft ?? "";
}

/**
 * Deterministic mock executor backed by the synthetic demo data. It never
 * touches files, networks, or models: "local" steps return synthetic file
 * lists, "model" steps return canned results, and actions are simulated.
 */
export function createMockExecutor(): StepExecutor {
  return {
    run(step, ctx) {
      const s = scenarioFor(ctx.spec);
      const r = s.result;
      const base = { mock: true, step: step.id, type: step.type };
      switch (step.type) {
        case "local.read_grant":
        case "local.repo_snapshot":
        case "input.pasted_text":
          return {
            ...base,
            source: "synthetic",
            items: s.inputs.map((f) => ({ name: f.name, size: f.sizeLabel })),
          };
        case "model.summarize":
          if (r.type === "documents") return { ...base, summary: r.summary };
          if (r.type === "email")
            return {
              ...base,
              summaries: r.messages.map((m) => ({ subject: m.subject, summary: m.summary })),
            };
          return { ...base, summary: r.findings.map((f) => f.title) };
        case "model.extract":
          return r.type === "documents" ? { ...base, table: r.table } : { ...base, table: null };
        case "model.classify":
          return r.type === "email"
            ? {
                ...base,
                labels: r.messages.map((m) => ({ subject: m.subject, category: m.category })),
              }
            : { ...base, labels: [] };
        case "model.draft_reply":
          return r.type === "email"
            ? {
                ...base,
                drafts: r.messages
                  .filter((m) => m.draft)
                  .map((m) => ({ subject: m.subject, draft: m.draft })),
              }
            : { ...base, drafts: [] };
        case "model.analyze_code":
          return r.type === "repository"
            ? { ...base, findings: r.findings }
            : { ...base, findings: [] };
        case "model.propose_diff":
          return r.type === "repository" ? { ...base, diff: r.diff } : { ...base, diff: "" };
        case "review.preview":
          return { ...base, preview: reportFor(s), inputHash: hashValue(ctx.outputs) };
        default:
          // Side-effecting types never reach run(); the engine routes them through approvals.
          throw new Error(`mock executor: ${step.type} is not a read-only step`);
      }
    },

    proposeAction(step, ctx) {
      const s = scenarioFor(ctx.spec);
      const titles: Record<string, string> = {
        "local.save_file": "Save report",
        "local.export_patch": "Export patch file",
        "local.apply_patch": "Apply patch to the selected repository",
        "client.copy_to_clipboard": "Copy draft to clipboard",
      };
      return {
        title: titles[step.type] ?? step.title,
        destination: MOCK_DESTINATION,
        content: reportFor(s),
      };
    },

    performAction(step, _ctx, proposal) {
      return {
        mock: true,
        step: step.id,
        type: step.type,
        simulated: true,
        written: false,
        contentHash: hashValue(proposal.content),
      };
    },
  };
}
