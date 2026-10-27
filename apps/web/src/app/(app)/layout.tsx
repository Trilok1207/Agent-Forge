import { Logo } from "@agentflow/ui";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiUnavailable } from "@/components/ApiUnavailable";
import { SessionKeepAlive } from "@/components/SessionKeepAlive";
import { SignOutButton } from "@/components/SignOutButton";
import { ApiUnavailableError, getMe } from "@/lib/api";

export const dynamic = "force-dynamic";

/** Signed-in area. The API enforces authorization; this layout only gates the UI. */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  let me;
  try {
    me = await getMe();
  } catch (e) {
    if (e instanceof ApiUnavailableError) {
      return (
        <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
          <ApiUnavailable />
        </main>
      );
    }
    throw e;
  }
  if (!me) redirect("/sign-in?error=signin_required");

  return (
    <div className="min-h-screen bg-slate-50">
      <SessionKeepAlive />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Link href="/workspace" aria-label="AgentFlow workspace">
              <Logo />
            </Link>
            <nav className="hidden gap-5 text-sm text-slate-600 sm:flex" aria-label="App">
              <Link href="/workspace" className="hover:text-ink-900">
                Workspace
              </Link>
              <Link href="/account" className="hover:text-ink-900">
                Account
              </Link>
              <Link href="/demo" className="hover:text-ink-900">
                Public demo
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/account"
              className="flex items-center gap-2 text-sm text-slate-700"
              title={me.user.email}
            >
              <Avatar name={me.user.name ?? me.user.email} />
              <span className="hidden max-w-40 truncate md:inline">
                {me.user.name ?? me.user.email}
              </span>
            </Link>
            <SignOutButton className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium hover:bg-slate-50" />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}

function Avatar({ name }: { name: string }) {
  // Initials only: remote avatar images would need a CSP/image-domain decision first.
  return (
    <span
      className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
      aria-hidden="true"
    >
      {name.trim().slice(0, 1).toUpperCase()}
    </span>
  );
}
