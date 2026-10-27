export function ApiUnavailable() {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
      <h1 className="font-display text-lg font-semibold">The AgentFlow API isn&apos;t reachable</h1>
      <p className="mt-2">
        Start it with{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">pnpm dev:api</code> (or{" "}
        <code className="rounded bg-white px-1.5 py-0.5 font-mono text-xs">pnpm dev</code>) and
        reload. The public demo at{" "}
        <a className="font-medium underline" href="/demo">
          /demo
        </a>{" "}
        works without it.
      </p>
    </div>
  );
}
