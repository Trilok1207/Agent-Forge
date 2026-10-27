import type { WorkflowPlan } from "@agentflow/contracts";
import { StepBadges } from "./badges";
import { StepIcon, type StepStatus } from "./StepIcon";

export function PlanView({
  plan,
  statuses,
}: {
  plan: WorkflowPlan;
  statuses: Record<string, StepStatus>;
}) {
  return (
    <ol className="space-y-2" aria-label="Workflow plan">
      {plan.steps.map((step, i) => (
        <li
          key={step.id}
          className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm animate-fade-in"
          style={{ animationDelay: `${i * 50}ms` }}
        >
          <StepIcon status={statuses[step.id] ?? "pending"} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink-900">
                <span className="mr-1.5 text-slate-400">{i + 1}.</span>
                {step.title}
              </p>
              <StepBadges type={step.type} />
            </div>
            <p className="mt-0.5 font-mono text-[11px] text-slate-400">{step.type}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}
