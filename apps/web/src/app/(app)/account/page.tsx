import { AuditResponse, SessionsResponse } from "@agentflow/contracts";
import type { Metadata } from "next";
import { RevokeSessionButton } from "@/components/RevokeSessionButton";
import { SignOutButton } from "@/components/SignOutButton";
import { apiGet, getMe, getProviders } from "@/lib/api";

export const metadata: Metadata = { title: "Account" };

const PROVIDER_LABEL = { google: "Google", github: "GitHub" } as const;

function when(iso: string) {
  return (
    new Date(iso).toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }) + " UTC"
  );
}

function describeAgent(ua: string | null) {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /Chrome\//.test(ua)
      ? "Chrome"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Safari\//.test(ua)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Mac OS X/.test(ua)
      ? "macOS"
      : /Android/.test(ua)
        ? "Android"
        : /iPhone|iPad/.test(ua)
          ? "iOS"
          : /Linux/.test(ua)
            ? "Linux"
            : "";
  return os ? `${browser} on ${os}` : browser;
}

export default async function AccountPage() {
  const [me, sessions, audit, providers] = await Promise.all([
    getMe(),
    apiGet("/v1/me/sessions", SessionsResponse),
    apiGet("/v1/me/audit", AuditResponse),
    getProviders(),
  ]);
  if (!me) return null;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-2xl font-semibold tracking-tight">Account</h1>

      <Card title="Profile">
        <dl className="grid gap-2 text-sm sm:grid-cols-[160px_1fr]">
          <dt className="text-slate-500">Name</dt>
          <dd>{me.user.name ?? "—"}</dd>
          <dt className="text-slate-500">Email</dt>
          <dd>{me.user.email}</dd>
          <dt className="text-slate-500">Workspace</dt>
          <dd>{me.workspaces.map((w) => `${w.name} (${w.role})`).join(", ")}</dd>
        </dl>
      </Card>

      <Card
        title="Sign-in methods"
        subtitle="GitHub sign-in reads only your name and email. It never grants repository access."
      >
        <ul className="divide-y divide-slate-100">
          {(["google", "github"] as const).map((p) => {
            const linked = me.linkedProviders.includes(p);
            const configured = providers?.providers.find((x) => x.id === p)?.configured ?? false;
            return (
              <li key={p} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="font-medium">{PROVIDER_LABEL[p]}</span>
                {linked ? (
                  <span className="rounded-full bg-flow-300/25 px-2.5 py-0.5 text-xs font-medium text-flow-600">
                    Connected
                  </span>
                ) : configured ? (
                  <form method="post" action={`/api/auth/${p}/link`}>
                    <button
                      type="submit"
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium hover:bg-slate-50"
                    >
                      Connect
                    </button>
                  </form>
                ) : (
                  <span className="text-xs text-slate-400">Not configured on this server</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>

      <Card
        title="Active sessions"
        subtitle="Revoking a session signs that browser out immediately."
      >
        <ul className="divide-y divide-slate-100">
          {(sessions.data?.sessions ?? []).map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
            >
              <div>
                <p className="font-medium">
                  {describeAgent(s.userAgent)}
                  {s.current && (
                    <span className="ml-2 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] text-brand-700">
                      This browser
                    </span>
                  )}
                </p>
                <p className="text-xs text-slate-500">
                  Signed in {when(s.createdAt)} · expires {when(s.expiresAt)}
                </p>
              </div>
              <RevokeSessionButton id={s.id} current={s.current} />
            </li>
          ))}
        </ul>
      </Card>

      <Card
        title="Recent activity"
        subtitle="Your audit log. It records actions and decisions, never file contents or keys."
      >
        {(audit.data?.events.length ?? 0) === 0 && (
          <p className="text-sm text-slate-400">No activity yet.</p>
        )}
        <ol className="space-y-2">
          {(audit.data?.events ?? []).map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span>
                <span className="font-mono text-xs text-brand-700">{e.action}</span>
                {Object.keys(e.detail).length > 0 && (
                  <span className="ml-2 text-xs text-slate-500">
                    {Object.entries(e.detail)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(" · ")}
                  </span>
                )}
              </span>
              <span className="text-xs text-slate-400">{when(e.at)}</span>
            </li>
          ))}
        </ol>
      </Card>

      <Card title="Sign out">
        <SignOutButton className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white hover:bg-ink-800" />
      </Card>
    </div>
  );
}

function Card({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-display text-base font-semibold">{title}</h2>
      {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}
