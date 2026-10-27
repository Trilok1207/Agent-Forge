export type StepStatus = "pending" | "running" | "done" | "awaiting" | "skipped";

export function StepIcon({ status }: { status: StepStatus }) {
  if (status === "done")
    return (
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-flow-500 text-white"
        aria-label="Done"
      >
        <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="currentColor" aria-hidden="true">
          <path d="M7.7 13.3 4.4 10l-1.1 1.1 4.4 4.4 9-9-1.1-1.1z" />
        </svg>
      </span>
    );
  if (status === "running")
    return (
      <span
        className="h-6 w-6 shrink-0 animate-spin rounded-full border-2 border-brand-200 border-t-brand-600"
        aria-label="Running"
      />
    );
  if (status === "awaiting")
    return (
      <span
        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-400 text-xs font-bold text-white"
        aria-label="Awaiting approval"
      >
        !
      </span>
    );
  return (
    <span
      className="h-6 w-6 shrink-0 rounded-full border-2 border-slate-200 bg-white"
      aria-label={status === "skipped" ? "Skipped" : "Pending"}
    />
  );
}
