import { useEffect, useRef, useState } from "react";
import { sha256Hex } from "../hash";

export interface PendingAction {
  title: string;
  stepType: string;
  destination: string;
  content: string;
  confirmLabel: string;
}

/**
 * Approval is bound to a hash of the exact content shown (ADR-007). In the demo
 * the approved action is recorded but nothing is written.
 */
export function ApprovalDialog({
  action,
  onApprove,
  onCancel,
}: {
  action: PendingAction;
  onApprove: (hash: string | null) => void;
  onCancel: () => void;
}) {
  const [hash, setHash] = useState<string | null | undefined>(undefined);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let live = true;
    void sha256Hex(action.content).then((h) => live && setHash(h));
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => {
      live = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [action.content, onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-ink-950/60 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-fade-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">
            Approval required
          </p>
          <h2 id="approval-title" className="mt-1 font-display text-lg font-semibold text-ink-900">
            {action.title}
          </h2>
        </div>
        <div className="space-y-3 overflow-y-auto px-5 py-4 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
            <dt className="text-slate-500">Action</dt>
            <dd className="font-mono text-xs leading-5 text-ink-900">{action.stepType}</dd>
            <dt className="text-slate-500">Destination</dt>
            <dd className="text-ink-900">{action.destination}</dd>
            <dt className="text-slate-500">Content hash</dt>
            <dd className="break-all font-mono text-xs leading-5 text-ink-900">
              {hash === undefined
                ? "computing…"
                : hash
                  ? `sha256:${hash}`
                  : "unavailable in this context"}
            </dd>
          </dl>
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 font-mono text-xs text-slate-700">
            {action.content}
          </pre>
          <p className="rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
            Demo mode: approving records the decision in the audit trail. Nothing is written to your
            device.
          </p>
        </div>
        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-ink-900 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={hash === undefined}
            onClick={() => onApprove(hash ?? null)}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {action.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
