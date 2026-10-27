import { BRAND, Logo } from "@agentflow/ui";
import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <Logo />
          <p className="mt-2 max-w-sm text-sm text-slate-500">{BRAND.tagline}</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500" aria-label="Footer">
          <Link href="/demo" className="hover:text-ink-900">
            Demo
          </Link>
          <Link href="/#safety" className="hover:text-ink-900">
            Safety
          </Link>
          <Link href="/#pricing" className="hover:text-ink-900">
            Pricing
          </Link>
          <Link href="/sign-in" className="hover:text-ink-900">
            Sign in
          </Link>
        </nav>
      </div>
      <p className="border-t border-slate-100 py-4 text-center text-xs text-slate-400">
        Preview build · Product name and pricing are provisional.
      </p>
    </footer>
  );
}
