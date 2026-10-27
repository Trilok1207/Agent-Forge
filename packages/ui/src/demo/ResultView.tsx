import type { DemoResult } from "@agentflow/demo-data";
import { Chip } from "./badges";

export function DiffView({ diff }: { diff: string }) {
  return (
    <pre
      className="overflow-x-auto rounded-xl bg-ink-900 p-4 font-mono text-[12px] leading-relaxed text-slate-200"
      aria-label="Proposed diff"
    >
      {diff.split("\n").map((line, i) => {
        const cls =
          line.startsWith("+") && !line.startsWith("+++")
            ? "bg-flow-500/15 text-flow-300"
            : line.startsWith("-") && !line.startsWith("---")
              ? "bg-rose-500/15 text-rose-300"
              : line.startsWith("@@")
                ? "text-brand-300"
                : "";
        return (
          <span key={i} className={`block px-1 ${cls}`}>
            {line || " "}
          </span>
        );
      })}
    </pre>
  );
}

export function ResultView({
  result,
  onCopyDraft,
}: {
  result: DemoResult;
  onCopyDraft?: (index: number) => void;
}) {
  if (result.type === "documents") {
    return (
      <div className="space-y-4">
        <section>
          <h4 className="text-sm font-semibold text-ink-900">Summary</h4>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-slate-700">
            {result.summary.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
        <section>
          <h4 className="text-sm font-semibold text-ink-900">Extracted terms</h4>
          <div className="mt-2 overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  {result.table.columns.map((c) => (
                    <th key={c} className="px-3 py-2 font-medium">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {result.table.rows.map((row) => (
                  <tr key={row.join("|")}>
                    {row.map((cell, j) => (
                      <td
                        key={j}
                        className={`px-3 py-2 ${j === 0 ? "font-medium text-ink-900" : "text-slate-600"}`}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (result.type === "email") {
    return (
      <ul className="space-y-3">
        {result.messages.map((m, i) => (
          <li key={m.subject} className="rounded-xl border border-slate-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium text-ink-900">{m.subject}</p>
              <Chip label={m.category} />
            </div>
            <p className="text-xs text-slate-500">{m.from}</p>
            <p className="mt-2 text-sm text-slate-700">{m.summary}</p>
            {m.draft ? (
              <div className="mt-3 rounded-lg bg-slate-50 p-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Draft reply · not sent
                </p>
                <p className="whitespace-pre-line text-sm text-slate-700">{m.draft}</p>
                {onCopyDraft && (
                  <button
                    type="button"
                    onClick={() => onCopyDraft(i)}
                    className="mt-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-900 hover:bg-slate-100"
                  >
                    Copy draft…
                  </button>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs italic text-slate-400">No reply needed.</p>
            )}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <h4 className="text-sm font-semibold text-ink-900">Findings</h4>
        <ul className="mt-2 space-y-2">
          {result.findings.map((f) => (
            <li key={f.title} className="flex items-start gap-2 text-sm">
              <Chip label={f.severity} />
              <span>
                <span className="font-medium text-ink-900">{f.title}.</span>{" "}
                <span className="text-slate-600">{f.detail}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
      <section>
        <h4 className="text-sm font-semibold text-ink-900">Proposed change</h4>
        <div className="mt-2">
          <DiffView diff={result.diff} />
        </div>
      </section>
    </div>
  );
}
