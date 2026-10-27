import { BRAND, DemoWorkspace, Logo } from "@agentflow/ui";
import { getVersion } from "@tauri-apps/api/app";
import { isTauri } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";

type View = "home" | "demo" | "settings";

const NAV: { id: View; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" },
  { id: "demo", label: "Demo workspace", icon: "M4 5h16v11H4zM8 20h8M12 16v4" },
  {
    id: "settings",
    label: "Settings",
    icon: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM4 12h2m12 0h2M12 4v2m0 12v2",
  },
];

function Icon({ d }: { d: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

export function App() {
  const [view, setView] = useState<View>("home");
  const [version, setVersion] = useState<string>("dev");

  useEffect(() => {
    if (isTauri())
      void getVersion()
        .then(setVersion)
        .catch(() => undefined);
  }, []);

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col bg-ink-950 p-4 text-slate-300">
        <Logo inverted />
        <nav className="mt-8 space-y-1" aria-label="Main">
          {NAV.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setView(n.id)}
              aria-current={view === n.id ? "page" : undefined}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition ${
                view === n.id ? "bg-white/10 text-white" : "hover:bg-white/5 hover:text-white"
              }`}
            >
              <Icon d={n.icon} />
              {n.label}
            </button>
          ))}
          <div
            className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500"
            title="Arrives in a later milestone"
          >
            <Icon d="M6 11V8a6 6 0 0 1 12 0v3M5 11h14v10H5z" />
            Local files · locked
          </div>
        </nav>
        <div className="mt-auto rounded-xl bg-white/5 p-3 text-xs">
          <p className="font-medium text-slate-200">Not signed in</p>
          <p className="mt-0.5 text-slate-500">Accounts arrive with the beta.</p>
        </div>
        <p className="mt-3 text-[11px] text-slate-600">v{version} · preview</p>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto">
        {view === "home" && <Home onOpenDemo={() => setView("demo")} />}
        {view === "demo" && (
          <div className="p-6">
            <Header
              title="Demo workspace"
              subtitle="Synthetic data · no model calls · nothing written to this PC"
            />
            <DemoWorkspace surface="desktop" />
          </div>
        )}
        {view === "settings" && <Settings version={version} />}
      </main>
    </div>
  );
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-5">
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
    </div>
  );
}

function Home({ onOpenDemo }: { onOpenDemo: () => void }) {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="relative overflow-hidden rounded-3xl bg-ink-900 p-8 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(50%_60%_at_0%_0%,rgba(99,96,242,0.4),transparent),radial-gradient(40%_50%_at_100%_100%,rgba(20,184,166,0.3),transparent)]" />
        <div className="relative">
          <p className="text-xs uppercase tracking-widest text-brand-300">Welcome</p>
          <h1 className="mt-2 font-display text-3xl font-semibold tracking-tight">
            {BRAND.name} for Windows
          </h1>
          <p className="mt-3 max-w-xl text-slate-300">{BRAND.description}</p>
          <button
            type="button"
            onClick={onOpenDemo}
            className="mt-6 rounded-xl bg-brand-500 px-5 py-2.5 font-medium text-white hover:bg-brand-400"
          >
            Open the demo workspace
          </button>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <Card
          title="Only what you pick"
          body="This app can read only files and folders you choose in a Windows file dialog. That arrives in a later build."
        />
        <Card
          title="Approve every write"
          body="Saving, copying, and applying patches always shows you the exact content first."
        />
        <Card
          title="No commands"
          body="The app can't run programs, send email, commit, or push. Those abilities don't exist in it."
        />
      </div>
    </div>
  );
}

function Card({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-display font-semibold">{title}</h2>
      <p className="mt-1.5 text-sm text-slate-600">{body}</p>
    </div>
  );
}

function Settings({ version }: { version: string }) {
  const rows: [string, string][] = [
    ["Version", version],
    ["Account", "Not signed in"],
    ["Model mode", "Not configured (demo uses mock data)"],
    ["File-system access", "None granted"],
    ["Shell / process execution", "Not available in this app"],
    ["Network", "None in this build"],
  ];
  return (
    <div className="mx-auto max-w-2xl p-8">
      <Header title="Settings" subtitle="What this build of the app can and can't do." />
      <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 px-5 py-3 text-sm">
            <dt className="text-slate-500">{k}</dt>
            <dd className="text-right font-medium">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
