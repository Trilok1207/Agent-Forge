import { WorkspaceDetail } from "@agentflow/contracts";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet, getMe } from "@/lib/api";

export const metadata: Metadata = { title: "Workspace" };

export default async function WorkspacePage() {
  const me = (await getMe())!;
  const workspace = me.workspaces[0];
  if (!workspace) notFound();
  const detail = await apiGet(`/v1/workspaces/${workspace.id}`, WorkspaceDetail);
  if (detail.status !== 200) notFound();

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm text-slate-500">Workspace · {detail.data.role}</p>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{detail.data.name}</h1>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
          Workflow execution arrives in a later release
        </span>
      </div>

      <h2 className="mt-8 text-sm font-semibold text-slate-500">Projects</h2>
      <ul className="mt-3 grid gap-4 md:grid-cols-2">
        {detail.data.projects.map((p) => (
          <li key={p.id}>
            <Link
              href={`/workspace/${detail.data.id}/projects/${p.id}`}
              className="block rounded-2xl border border-slate-200 bg-white p-5 transition hover:border-brand-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-lg font-semibold">{p.name}</h3>
                {p.isDemo && (
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-brand-200">
                    Demo · synthetic
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-slate-600">{p.description}</p>
              <p className="mt-3 text-xs text-slate-500">{p.itemCount} items</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
