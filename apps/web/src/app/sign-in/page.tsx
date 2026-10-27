import { LogoMark } from "@agentflow/ui";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Sign in" };

const PROVIDERS = ["Google", "GitHub"];

/** Placeholder only. Real OAuth arrives in milestone M4. */
export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <LogoMark className="mx-auto h-12 w-12" />
        <h1 className="mt-4 font-display text-xl font-semibold">Sign in to AgentFlow</h1>
        <p className="mt-1 text-sm text-slate-500">Accounts open with the beta.</p>
        <div className="mt-6 space-y-2">
          {PROVIDERS.map((p) => (
            <button
              key={p}
              type="button"
              disabled
              className="w-full cursor-not-allowed rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-400"
            >
              Continue with {p} · coming soon
            </button>
          ))}
        </div>
        <p className="mt-6 text-xs text-slate-500">
          GitHub sign-in will only read your name and email. It never grants access to your
          repositories.
        </p>
        <Link
          href="/demo"
          className="mt-6 inline-block text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          Try the demo without an account →
        </Link>
      </div>
    </main>
  );
}
