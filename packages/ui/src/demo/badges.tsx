import { stepInfo, type StepType } from "@agentflow/contracts";

const LOCATION_LABEL = {
  cloud: { text: "Cloud model", cls: "bg-brand-50 text-brand-700 ring-brand-200" },
  desktop: { text: "This device", cls: "bg-flow-300/20 text-flow-600 ring-flow-300/60" },
  client: { text: "In app", cls: "bg-slate-100 text-slate-600 ring-slate-200" },
} as const;

export function StepBadges({ type }: { type: StepType }) {
  const info = stepInfo(type);
  const loc = LOCATION_LABEL[info.location];
  return (
    <span className="flex flex-wrap gap-1.5">
      <span
        className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${loc.cls}`}
      >
        {loc.text}
      </span>
      {info.effect !== "none" && (
        <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 ring-1 ring-inset ring-amber-200">
          Needs your approval
        </span>
      )}
    </span>
  );
}

const CATEGORY_CLS: Record<string, string> = {
  "Action needed": "bg-rose-50 text-rose-700 ring-rose-200",
  Billing: "bg-amber-50 text-amber-700 ring-amber-200",
  Scheduling: "bg-brand-50 text-brand-700 ring-brand-200",
  FYI: "bg-slate-100 text-slate-600 ring-slate-200",
};

export function Chip({ label, tone }: { label: string; tone?: string }) {
  const cls = CATEGORY_CLS[tone ?? label] ?? SEVERITY_CLS[tone ?? label] ?? CATEGORY_CLS.FYI;
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${cls}`}>
      {label}
    </span>
  );
}

const SEVERITY_CLS: Record<string, string> = {
  high: "bg-rose-50 text-rose-700 ring-rose-200",
  medium: "bg-amber-50 text-amber-700 ring-amber-200",
  low: "bg-slate-100 text-slate-600 ring-slate-200",
};
