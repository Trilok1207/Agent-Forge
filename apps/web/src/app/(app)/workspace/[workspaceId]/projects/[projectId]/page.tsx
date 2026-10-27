import { ProjectDetail } from "@agentflow/contracts";
import { DemoWorkspace } from "@agentflow/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiGet } from "@/lib/api";

export const metadata: Metadata = { title: "Project" };

const GROUPS = [
  { key: "documents", label: "Documents" },
  { key: "email", label: "Email" },
  { key: "repository", label: "Repository" },
] as const;

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ workspaceId: string; projectId: string }>;
}) {
  const { workspaceId, projectId } = await params;
  // The API decides access; anything but 200 (including another user's project) renders as not found.
  const res = await apiGet(
    `/v1/workspaces/${encodeURIComponent(workspaceId)}/projects/${encodeURIComponent(projectId)}`,
    ProjectDetail,
  );
  if (res.status !== 200) notFound();
  const project = res.data;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/workspace" className="text-sm text-brand-700 hover:text-brand-800">
          ← Workspace
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{project.name}</h1>
          {project.isDemo && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700 ring-1 ring-brand-200">
              Synthetic data · no local file access
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-slate-600">{project.description}</p>
      </div>

      <section className="grid gap-4 md:grid-cols-3">
        {GROUPS.map((g) => (
          <div key={g.key} className="rounded-2xl border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold">{g.label}</h2>
            <ul className="mt-3 space-y-2">
              {project.items
                .filter((i) => i.workflow === g.key)
                .map((i) => (
                  <li key={i.id} className="rounded-lg border border-slate-100 px-3 py-2">
                    <p className="truncate text-sm text-ink-900">{i.name}</p>
                    <p className="text-[11px] text-slate-400">{i.sizeLabel}</p>
                    <p className="mt-1 line-clamp-2 whitespace-pre-line text-xs text-slate-500">
                      {i.preview}
                    </p>
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </section>

      {project.isDemo && (
        <section>
          <h2 className="font-display text-lg font-semibold">Try the approval loop</h2>
          <p className="mb-4 mt-1 text-sm text-slate-600">
            Mock mode: plans and results are prepared in advance. No model calls, nothing written.
          </p>
          <DemoWorkspace surface="web" />
        </section>
      )}
    </div>
  );
}
