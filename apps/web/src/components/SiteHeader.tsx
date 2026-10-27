import { Logo } from "@agentflow/ui";
import Link from "next/link";

const NAV = [
  { href: "/#how", label: "How it works" },
  { href: "/#workflows", label: "Workflows" },
  { href: "/#safety", label: "Safety" },
  { href: "/#pricing", label: "Pricing" },
];

export function SiteHeader({ dark = false }: { dark?: boolean }) {
  const link = dark ? "text-slate-300 hover:text-white" : "text-slate-600 hover:text-ink-900";
  return (
    <header
      className={dark ? "absolute inset-x-0 top-0 z-20" : "border-b border-slate-200 bg-white"}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" aria-label="AgentFlow home">
          <Logo inverted={dark} />
        </Link>
        <nav className="hidden items-center gap-6 text-sm md:flex" aria-label="Main">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className={link}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <Link
            href="/sign-in"
            className={`hidden rounded-lg px-3 py-2 text-sm font-medium sm:block ${link}`}
          >
            Sign in
          </Link>
          <Link
            href="/demo"
            className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-500"
          >
            Try the demo
          </Link>
        </div>
      </div>
    </header>
  );
}
