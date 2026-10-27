import { DemoWorkspace } from "@agentflow/ui";
import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";

export const metadata: Metadata = {
  title: "Demo workspace",
  description:
    "Try AgentFlow's plan → preview → approve loop on synthetic data. Nothing is sent or written.",
};

export default function DemoPage() {
  return (
    <>
      <SiteHeader />
      <main className="min-h-[calc(100vh-4rem)] bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-display text-2xl font-semibold tracking-tight">Demo workspace</h1>
              <p className="mt-1 text-sm text-slate-600">
                Pick a workflow, plan it, approve it, and watch the audit trail. All data is
                synthetic.
              </p>
            </div>
            <p className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-xs text-brand-800">
              Mock mode · no model calls · no uploads · nothing written
            </p>
          </div>
          <DemoWorkspace surface="web" />
        </div>
      </main>
    </>
  );
}
