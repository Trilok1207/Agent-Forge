"use client";

import { demoProject, type DemoScenario } from "@agentflow/demo-data";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ApprovalDialog, type PendingAction } from "./ApprovalDialog";
import { PlanView } from "./PlanView";
import { ResultView } from "./ResultView";
import type { StepStatus } from "./StepIcon";

type Phase = "compose" | "planning" | "planned" | "running" | "review" | "done";

interface AuditEntry {
  at: string;
  event: string;
  detail: string;
}

const STEP_MS = 650;

function nowLabel() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function reportMarkdown(s: DemoScenario): string {
  const r = s.result;
  if (r.type === "documents") {
    const head = `| ${r.table.columns.join(" | ")} |\n| ${r.table.columns.map(() => "---").join(" | ")} |`;
    const rows = r.table.rows.map((row) => `| ${row.join(" | ")} |`).join("\n");
    return `# Northwind summary\n\n${r.summary.map((l) => `- ${l}`).join("\n")}\n\n${head}\n${rows}\n`;
  }
  if (r.type === "repository") return `${r.diff}\n`;
  return "";
}

/**
 * Mock demo workspace shared by the website and the desktop shell. Uses only
 * bundled synthetic data: no network, no model calls, no file access (B12).
 */
export function DemoWorkspace({ surface = "web" }: { surface?: "web" | "desktop" }) {
  const [kind, setKind] = useState<DemoScenario["kind"]>("documents");
  const scenario = useMemo(() => demoProject.scenarios.find((s) => s.kind === kind)!, [kind]);
  const [request, setRequest] = useState(scenario.suggestedRequest);
  const [phase, setPhase] = useState<Phase>("compose");
  const [progress, setProgress] = useState(0);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);

  const approvalIndex = scenario.plan.steps.findIndex((s) => s.requiresApproval);
  const log = useCallback((event: string, detail: string) => {
    setAudit((a) => [{ at: nowLabel(), event, detail }, ...a]);
  }, []);

  const selectScenario = (k: DemoScenario["kind"]) => {
    const next = demoProject.scenarios.find((s) => s.kind === k)!;
    setKind(k);
    setRequest(next.suggestedRequest);
    setPhase("compose");
    setProgress(0);
    setPending(null);
  };

  useEffect(() => {
    if (phase === "planning") {
      const t = setTimeout(() => {
        setPhase("planned");
        log(
          "plan.created",
          `${scenario.plan.steps.length} steps · validated against step registry`,
        );
      }, 700);
      return () => clearTimeout(t);
    }
    if (phase === "running") {
      const t = setTimeout(() => {
        const step = scenario.plan.steps[progress]!;
        log("step.completed", step.type);
        setProgress(progress + 1);
        if (progress + 1 >= approvalIndex) setPhase("review");
      }, STEP_MS);
      return () => clearTimeout(t);
    }
  }, [phase, progress, approvalIndex, scenario, log]);

  const statuses: Record<string, StepStatus> = {};
  scenario.plan.steps.forEach((step, i) => {
    if (phase === "compose" || phase === "planning" || phase === "planned")
      statuses[step.id] = "pending";
    else if (i < progress) statuses[step.id] = "done";
    else if (i === progress && phase === "running") statuses[step.id] = "running";
    else if (i === approvalIndex && phase === "review") statuses[step.id] = "awaiting";
    else if (phase === "done") statuses[step.id] = "done";
    else statuses[step.id] = "pending";
  });

  const approvalStep = scenario.plan.steps[approvalIndex]!;

  const requestAction = (draftIndex?: number) => {
    const r = scenario.result;
    if (r.type === "email") {
      const msg = r.messages[draftIndex ?? 0]!;
      setPending({
        title: `Copy reply to “${msg.subject}”`,
        stepType: approvalStep.type,
        destination: "Clipboard (demo: not copied)",
        content: msg.draft,
        confirmLabel: "Approve copy",
      });
      return;
    }
    setPending({
      title: r.type === "documents" ? "Save summary report" : "Export proposed patch",
      stepType: approvalStep.type,
      destination: `${r.saveAs} — location chosen in a save dialog (demo: not written)`,
      content: reportMarkdown(scenario),
      confirmLabel: r.type === "documents" ? "Approve save" : "Approve export",
    });
  };

  const approve = (hash: string | null) => {
    log(
      "action.approved",
      `${pending?.stepType} · ${hash ? `sha256:${hash.slice(0, 12)}…` : "no hash"} · demo, not written`,
    );
    setPending(null);
    setPhase("done");
  };

  const cancelAction = useCallback(() => {
    setPending(null);
    log("action.declined", "No changes made");
  }, [log]);

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_minmax(0,1fr)_280px]">
      {/* Project / inputs */}
      <aside className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Project</p>
        <p className="mt-1 font-medium text-ink-900">{demoProject.name}</p>
        <p className="mt-1 text-xs text-slate-500">{demoProject.description}</p>
        <div
          className="mt-4 flex gap-1 rounded-xl bg-slate-100 p-1 lg:flex-col"
          role="tablist"
          aria-label="Workflow"
        >
          {demoProject.scenarios.map((s) => (
            <button
              key={s.kind}
              role="tab"
              aria-selected={s.kind === kind}
              onClick={() => selectScenario(s.kind)}
              className={`flex-1 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                s.kind === kind
                  ? "bg-white text-ink-900 shadow-sm"
                  : "text-slate-500 hover:text-ink-900"
              }`}
            >
              {s.label}
              <span className="hidden text-xs font-normal text-slate-500 lg:block">
                {s.tagline}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
          Selected inputs
        </p>
        <ul className="mt-2 space-y-1.5">
          {scenario.inputs.map((f) => (
            <li
              key={f.name}
              className="group rounded-lg border border-slate-100 px-2.5 py-2"
              title={f.preview}
            >
              <p className="truncate text-sm text-ink-900">{f.name}</p>
              <p className="text-[11px] text-slate-400">{f.sizeLabel} · synthetic</p>
            </li>
          ))}
        </ul>
      </aside>

      {/* Request, plan, results */}
      <section className="min-w-0 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <label htmlFor="demo-request" className="text-sm font-semibold text-ink-900">
            What should AgentFlow do?
          </label>
          <textarea
            id="demo-request"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            disabled={phase !== "compose"}
            rows={3}
            className="mt-2 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-ink-900 outline-none focus:border-brand-400 focus:bg-white disabled:opacity-70"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-slate-500">
              Demo uses a prepared plan. Your text stays on this page.
            </p>
            {phase === "compose" ? (
              <button
                type="button"
                onClick={() => {
                  log("request.submitted", `${scenario.label} workflow`);
                  setPhase("planning");
                }}
                disabled={!request.trim()}
                className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-700 disabled:opacity-50"
              >
                Plan workflow
              </button>
            ) : (
              <button
                type="button"
                onClick={() => selectScenario(kind)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-slate-50"
              >
                Start over
              </button>
            )}
          </div>
        </div>

        {phase !== "compose" && (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 animate-fade-in">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-semibold text-ink-900">Proposed plan</h3>
                <p className="text-xs text-slate-500">
                  {phase === "planning" ? "Planning…" : scenario.plan.summary}
                </p>
              </div>
              {phase === "planned" && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      log("plan.rejected", "Run cancelled");
                      selectScenario(kind);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-ink-900 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      log("plan.approved", scenario.plan.id);
                      setPhase("running");
                    }}
                    className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                  >
                    Approve plan &amp; run
                  </button>
                </div>
              )}
            </div>
            {phase === "planning" ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-14 animate-pulse rounded-xl bg-white" />
                ))}
              </div>
            ) : (
              <PlanView plan={scenario.plan} statuses={statuses} />
            )}
          </div>
        )}

        {(phase === "review" || phase === "done") && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 animate-fade-in">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-ink-900">Preview</h3>
              {phase === "review" && scenario.result.type !== "email" && (
                <button
                  type="button"
                  onClick={() => requestAction()}
                  className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700"
                >
                  {scenario.result.type === "documents" ? "Save report…" : "Export patch…"}
                </button>
              )}
              {phase === "done" && (
                <span className="rounded-full bg-flow-300/25 px-2.5 py-1 text-xs font-medium text-flow-600">
                  Approved · demo, nothing written
                </span>
              )}
            </div>
            <ResultView
              result={scenario.result}
              onCopyDraft={phase === "review" ? requestAction : undefined}
            />
          </div>
        )}
      </section>

      {/* Audit trail */}
      <aside className="rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Audit trail
          </p>
          <span className="text-[11px] text-slate-400">
            {surface === "desktop" ? "Desktop" : "Web"} demo
          </span>
        </div>
        {audit.length === 0 ? (
          <p className="mt-3 text-xs text-slate-400">
            Every request, approval, and action appears here.
          </p>
        ) : (
          <ol className="mt-3 space-y-2.5" aria-live="polite">
            {audit.map((a, i) => (
              <li
                key={audit.length - i}
                className="border-l-2 border-brand-200 pl-2.5 animate-fade-in"
              >
                <p className="font-mono text-[11px] text-brand-700">{a.event}</p>
                <p className="text-xs text-slate-600">{a.detail}</p>
                <p className="text-[10px] text-slate-400">{a.at}</p>
              </li>
            ))}
          </ol>
        )}
      </aside>

      {pending && <ApprovalDialog action={pending} onApprove={approve} onCancel={cancelAction} />}
    </div>
  );
}
