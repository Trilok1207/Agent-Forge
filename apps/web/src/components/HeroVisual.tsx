const STEPS = [
  { title: "Read 3 selected files", where: "This device", done: true },
  { title: "Summarize agreement and review", where: "Cloud model", done: true },
  { title: "Extract key contract terms", where: "Cloud model", done: true },
  { title: "Save report to a location you choose", where: "This device", approval: true },
];

/** Static illustration of the request → plan → approval loop. */
export function HeroVisual() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-brand-500/30 via-transparent to-flow-400/30 blur-2xl" />
      <div className="relative rounded-2xl border border-white/10 bg-ink-800/80 p-4 shadow-2xl backdrop-blur">
        <div className="rounded-xl bg-ink-900 p-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Request</p>
          <p className="mt-1 text-sm text-slate-100">
            Summarize the Northwind agreement and pull the key terms into a table.
          </p>
        </div>
        <ol className="mt-3 space-y-2">
          {STEPS.map((s) => (
            <li key={s.title} className="flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                  s.done ? "bg-flow-500 text-white" : "bg-amber-400 text-ink-900"
                }`}
              >
                {s.done ? "✓" : "!"}
              </span>
              <span className="flex-1 truncate text-sm text-slate-200">{s.title}</span>
              <span className="hidden rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-slate-300 sm:block">
                {s.where}
              </span>
            </li>
          ))}
        </ol>
        <div className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/10 p-3">
          <p className="text-xs font-semibold text-amber-200">Approval required</p>
          <p className="mt-0.5 text-xs text-slate-300">
            Save <span className="font-mono">Northwind-summary.md</span> · sha256:9f2c…e41a
          </p>
          <div className="mt-2 flex gap-2">
            <span className="rounded-md bg-white/10 px-2.5 py-1 text-xs text-slate-200">
              Cancel
            </span>
            <span className="rounded-md bg-brand-500 px-2.5 py-1 text-xs font-medium text-white">
              Approve save
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
