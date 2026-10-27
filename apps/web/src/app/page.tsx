import { BRAND } from "@agentflow/ui";
import Link from "next/link";
import { HeroVisual } from "@/components/HeroVisual";
import { Pricing } from "@/components/Pricing";
import { SiteFooter } from "@/components/SiteFooter";
import { SiteHeader } from "@/components/SiteHeader";

const PROMISES = [
  "Only the files you pick",
  "Approval before every write",
  "Never sends email",
  "No shell commands or pushes",
];

const HOW = [
  {
    n: "1",
    title: "Describe the task",
    body: "Type what you need in plain language and pick the files, emails, or repository it should use.",
  },
  {
    n: "2",
    title: "Review the plan",
    body: "AgentFlow turns your request into a step-by-step plan that shows where each step runs and what it may change.",
  },
  {
    n: "3",
    title: "Approve each action",
    body: "Results appear as previews and diffs. Nothing is saved, copied, or applied until you approve that exact content.",
  },
];

const WORKFLOWS = [
  {
    title: "Documents",
    body: "Summarize contracts, reports, and spreadsheets, or extract the fields you care about into a table.",
    points: [
      "PDF, Word, Markdown, CSV, text",
      "Preview before saving",
      "Save only where you choose",
    ],
    never: "Never reads files you didn't select",
    accent: "from-brand-500 to-brand-700",
  },
  {
    title: "Email",
    body: "Summarize and label the messages you provide, then get draft replies in your tone.",
    points: [
      "Paste text or pick .eml files",
      "Classify by your labels",
      "Copy drafts with one approval",
    ],
    never: "Never sends, and never connects to your mailbox",
    accent: "from-flow-400 to-flow-600",
  },
  {
    title: "Repositories",
    body: "Point at a local repository to get an analysis and proposed edits as a reviewable diff.",
    points: [
      "Respects .gitignore and skips secrets",
      "File-by-file diff review",
      "Export a .patch or apply on approval",
    ],
    never: "Never runs commands, commits, or pushes",
    accent: "from-brand-400 to-flow-500",
  },
];

const FAQ = [
  {
    q: "Does my data leave my computer?",
    a: "Only the content you select for a run is sent over an encrypted connection to the model that processes it. You see the file list before anything is sent. Your files are never indexed or uploaded in bulk.",
  },
  {
    q: "Can I use my own model API key?",
    a: "Yes. Bring-your-own-key is planned for paid plans. Keys are stored encrypted on our servers, are never sent back to your browser or desktop app, and never appear in logs.",
  },
  {
    q: "What can AgentFlow change on my machine?",
    a: "Only what you approve: saving a file to a location you choose, copying a draft, or applying a patch inside a repository you picked. Every approval is recorded in your audit log.",
  },
  {
    q: "Is there a Mac version?",
    a: "The first release is Windows-only. The website and demo work on any modern browser, including phones.",
  },
];

export default function Home() {
  return (
    <>
      <SiteHeader dark />
      <main>
        {/* Hero */}
        <section className="relative overflow-hidden bg-ink-950 pt-28 pb-20 text-white sm:pt-36 sm:pb-28">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_20%_0%,rgba(99,96,242,0.35),transparent),radial-gradient(40%_40%_at_90%_30%,rgba(20,184,166,0.25),transparent)]"
            aria-hidden="true"
          />
          <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-2">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-slate-300">
                <span className="h-1.5 w-1.5 rounded-full bg-flow-400" /> Windows app in development
                · Demo open now
              </p>
              <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
                Automate real work in plain language.{" "}
                <span className="bg-gradient-to-r from-brand-300 to-flow-300 bg-clip-text text-transparent">
                  On your terms.
                </span>
              </h1>
              <p className="mt-5 max-w-xl text-lg text-slate-300">{BRAND.description}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/demo"
                  className="rounded-xl bg-brand-500 px-5 py-3 text-center font-medium text-white shadow-lg shadow-brand-500/30 hover:bg-brand-400"
                >
                  Try the live demo
                </Link>
                <span
                  className="cursor-not-allowed rounded-xl border border-white/15 px-5 py-3 text-center font-medium text-slate-300"
                  aria-disabled="true"
                >
                  Download for Windows · soon
                </span>
              </div>
            </div>
            <HeroVisual />
          </div>
        </section>

        {/* Promises */}
        <section className="border-b border-slate-200 bg-slate-50">
          <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-4 px-4 py-6 text-sm font-medium text-slate-700 sm:px-6 md:grid-cols-4">
            {PROMISES.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-flow-500 text-[10px] text-white">
                  ✓
                </span>
                {p}
              </li>
            ))}
          </ul>
        </section>

        {/* How it works */}
        <section id="how" className="scroll-mt-20 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="How it works"
              title="You stay in the loop at every step"
              body="Requests become plans, plans become previews, and previews become changes only after you approve them."
            />
            <ol className="mt-12 grid gap-6 md:grid-cols-3">
              {HOW.map((h) => (
                <li key={h.n} className="rounded-2xl border border-slate-200 p-6">
                  <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-50 font-display font-semibold text-brand-700">
                    {h.n}
                  </span>
                  <h3 className="mt-4 font-display text-lg font-semibold">{h.title}</h3>
                  <p className="mt-2 text-sm text-slate-600">{h.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Workflows */}
        <section id="workflows" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Workflows"
              title="Three focused workflows at launch"
              body="Each one works only on what you select and stops before it changes anything."
            />
            <div className="mt-12 grid gap-6 md:grid-cols-3">
              {WORKFLOWS.map((w) => (
                <article
                  key={w.title}
                  className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white"
                >
                  <div className={`h-1.5 bg-gradient-to-r ${w.accent}`} />
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-display text-xl font-semibold">{w.title}</h3>
                    <p className="mt-2 text-sm text-slate-600">{w.body}</p>
                    <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                      {w.points.map((p) => (
                        <li key={p} className="flex gap-2">
                          <span className="text-flow-600">✓</span>
                          {p}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-5 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
                      {w.never}
                    </p>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-10 text-center">
              <Link href="/demo" className="font-medium text-brand-700 hover:text-brand-800">
                Run all three in the demo →
              </Link>
            </div>
          </div>
        </section>

        {/* Safety */}
        <section id="safety" className="scroll-mt-20 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Safety by design"
              title="Clear boundaries between the cloud and your PC"
              body="Planning and model calls run in the cloud. Your files are touched only by the desktop app, only where you allowed it."
            />
            <div className="mt-12 grid gap-6 lg:grid-cols-2">
              <BoundaryCard
                title="AgentFlow cloud"
                tone="brand"
                items={[
                  "Accounts, subscriptions, and server-enforced quotas",
                  "Workflow planning from a fixed set of safe steps",
                  "Model calls with hosted keys or your own key",
                  "API keys never sent to browsers or written to logs",
                  "Tamper-evident audit log of every approval",
                ]}
              />
              <BoundaryCard
                title="Your Windows PC"
                tone="flow"
                items={[
                  "Reads only the files and folders you pick",
                  "Skips secrets like .env files and private keys",
                  "Shows previews and diffs before any change",
                  "Writes only the exact content you approved",
                  "Can't run commands, send email, or push code",
                ]}
              />
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-20 bg-slate-50 py-20 sm:py-24">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <SectionHeading
              eyebrow="Pricing"
              title="Start free. Upgrade monthly or yearly."
              body="Paid plans open with the beta. The demo is free and needs no account."
            />
            <div className="mt-10">
              <Pricing />
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-20 sm:py-24">
          <div className="mx-auto max-w-3xl px-4 sm:px-6">
            <SectionHeading eyebrow="FAQ" title="Questions people ask first" />
            <div className="mt-10 divide-y divide-slate-200 rounded-2xl border border-slate-200">
              {FAQ.map((f) => (
                <details key={f.q} className="group p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                    {f.q}
                    <span className="text-slate-400 transition group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-3 text-sm text-slate-600">{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="px-4 pb-20 sm:px-6">
          <div className="mx-auto max-w-6xl overflow-hidden rounded-3xl bg-ink-950 px-6 py-14 text-center text-white sm:px-12">
            <h2 className="font-display text-3xl font-semibold tracking-tight">
              See the approval loop for yourself
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-slate-300">
              The demo runs on synthetic files, emails, and a sample repo. No sign-in, no uploads,
              nothing written.
            </p>
            <Link
              href="/demo"
              className="mt-8 inline-block rounded-xl bg-brand-500 px-6 py-3 font-medium text-white hover:bg-brand-400"
            >
              Open the demo workspace
            </Link>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold text-brand-600">{eyebrow}</p>
      <h2 className="mt-2 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
        {title}
      </h2>
      {body && <p className="mt-4 text-slate-600">{body}</p>}
    </div>
  );
}

function BoundaryCard({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "brand" | "flow";
}) {
  const dot = tone === "brand" ? "bg-brand-500" : "bg-flow-500";
  return (
    <div className="rounded-2xl border border-slate-200 p-6">
      <h3 className="flex items-center gap-2 font-display text-lg font-semibold">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        {title}
      </h3>
      <ul className="mt-4 space-y-2.5 text-sm text-slate-700">
        {items.map((i) => (
          <li key={i} className="flex gap-2">
            <span className="text-slate-400">—</span>
            {i}
          </li>
        ))}
      </ul>
    </div>
  );
}
