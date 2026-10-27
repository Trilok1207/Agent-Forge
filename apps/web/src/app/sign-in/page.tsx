import { SignInErrorCode } from "@agentflow/contracts";
import { LogoMark } from "@agentflow/ui";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiUnavailableError, getMe, getProviders } from "@/lib/api";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

const LABEL = { google: "Google", github: "GitHub" } as const;

const ERRORS: Record<SignInErrorCode, string> = {
  provider_not_configured: "That sign-in provider isn't configured on this server yet.",
  oauth_state: "The sign-in attempt expired or didn't match. Please try again.",
  access_denied: "Sign-in was cancelled.",
  oauth_exchange: "We couldn't complete sign-in with the provider. Please try again.",
  email_unverified: "Your email address must be verified with the provider.",
  account_exists:
    "An account with this email already exists. Sign in with the method you used before, then connect this one from your account page.",
  account_linked_elsewhere: "That identity is already connected to a different AgentFlow account.",
  signin_required: "Please sign in to continue.",
};

function safeNext(next: string | undefined) {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")
    ? next
    : "/workspace";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  let me = null;
  try {
    me = await getMe();
  } catch (e) {
    if (!(e instanceof ApiUnavailableError)) throw e;
  }
  if (me) redirect(safeNext(next));

  const providers = await getProviders();
  const errorCode = SignInErrorCode.safeParse(error);
  const anyConfigured = providers?.providers.some((p) => p.configured) ?? false;

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <Link href="/" aria-label="AgentFlow home">
          <LogoMark className="mx-auto h-12 w-12" />
        </Link>
        <h1 className="mt-4 font-display text-xl font-semibold">Sign in to AgentFlow</h1>
        <p className="mt-1 text-sm text-slate-500">Use your Google or GitHub account.</p>

        {errorCode.success && (
          <p
            role="alert"
            className="mt-4 rounded-lg bg-rose-50 px-3 py-2 text-left text-sm text-rose-700"
          >
            {ERRORS[errorCode.data]}
          </p>
        )}

        <div className="mt-6 space-y-2">
          {providers === null ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              The sign-in service is unreachable. Start the API (
              <code className="font-mono text-xs">pnpm dev:api</code>).
            </p>
          ) : (
            providers.providers.map((p) =>
              p.configured ? (
                <a
                  key={p.id}
                  href={`/api/auth/${p.id}/start?next=${encodeURIComponent(safeNext(next))}`}
                  className="block w-full rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-ink-900 hover:bg-slate-50"
                >
                  Continue with {LABEL[p.id]}
                </a>
              ) : (
                <button
                  key={p.id}
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-400"
                >
                  {LABEL[p.id]} · not configured
                </button>
              ),
            )
          )}
        </div>
        {providers && !anyConfigured && (
          <p className="mt-3 text-xs text-slate-500">
            No sign-in providers are configured on this server. See{" "}
            <code className="font-mono">docs/auth-setup.md</code>.
          </p>
        )}
        <p className="mt-6 text-xs text-slate-500">
          GitHub sign-in only reads your name and email. It never grants access to your
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
