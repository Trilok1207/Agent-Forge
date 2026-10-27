# Architecture decision log

Each entry: decision, why, and the tradeoff we accept. Status is **Proposed** until the owner reviews it at the Session 0 gate. Vendor choices are deliberately left open in [decisions-pending.md](decisions-pending.md).

---

### ADR-001 — Hybrid: cloud orchestration, permissioned local execution
**Decision:** Planning, run state, model calls, quotas, billing, and audit live in the cloud. The desktop app only reads user-granted paths and performs approved local writes.
**Why:** It keeps provider keys and quota enforcement out of reach of the client. Cloud and model never get direct file-system access.
**Tradeoff:** Extracted file content transits our cloud to the model vendor, so we need clear disclosure, encryption at rest, and short artifact retention. No offline mode in V1.

### ADR-002 — TypeScript everywhere except the local core (Rust)
**Decision:** TypeScript for web, API, worker, and shared packages. Rust only for the security-critical local core inside Tauri.
**Why:** One language for the DSL, validator, and UI across web and desktop. Rust is required by Tauri anyway, and it suits path and patch handling.
**Tradeoff:** Two toolchains in CI. Some types are duplicated across the IPC boundary (mitigated by generating TS bindings, e.g. `specta`/`ts-rs`).

### ADR-003 — Tauri v2 over Electron for desktop
**Why:** Small installer, uses system WebView2 on Windows, and a capability/permission model that lets us deny shell and scope file access by default.
**Tradeoff:** WebView2 differences from Chromium-in-Electron. Smaller ecosystem. Desktop E2E tooling is less mature (tauri-driver + WebDriver, Windows CI runners).

### ADR-004 — Separate API service instead of only Next.js route handlers
**Decision:** `apps/api` (Hono) plus `apps/worker`. Next.js is the web UI and BFF.
**Why:** The desktop client needs a stable, versioned API. Long-running runs and webhooks don't fit serverless request limits. Key handling stays in one small service.
**Tradeoff:** More deploy units than a pure-Next.js app. Mitigation: one container image with two entrypoints (api, worker).

### ADR-005 — Postgres for state, queue, and audit (no Redis/Temporal in V1)
**Decision:** Postgres with Drizzle migrations. Job queue via pg-boss or Graphile Worker. Audit is an insert-only table with a hash chain.
**Why:** One stateful dependency. Transactional consistency between run state, quota reservations, and audit rows.
**Tradeoff:** Lower queue throughput than dedicated brokers, which is fine at V1 scale. Revisit a durable workflow engine (Temporal/Inngest) if runs become long or branching. The DSL is engine-agnostic.

### ADR-006 — Workflow plans are validated data from a fixed step registry
**Decision:** The planner model emits a JSON `WorkflowPlan`. Only registered step types are allowed. A pure policy engine validates every plan. Side-effecting steps always carry an approval gate.
**Why:** Natural-language input can't expand capabilities. Prompt injection in files can at worst produce a bad plan or bad text, never a new capability. It also gives the future visual builder its data model.
**Tradeoff:** Less flexible than "agent with tools". Every new capability needs code, an ADR, and threat-model review. That is deliberate.

### ADR-007 — Approvals bound to content hashes
**Decision:** A write approval records the SHA-256 of the exact bytes (or patch) shown to the user. The desktop refuses to write if the bytes differ. Patches also check pre-image hashes of the target files.
**Why:** Prevents time-of-check/time-of-use swaps between preview and write.
**Tradeoff:** Any change after preview forces re-approval.

### ADR-008 — Desktop auth via system browser + PKCE; tokens in Windows Credential Manager
**Why:** Avoids embedding OAuth in a WebView, which Google blocks. Refresh tokens stay out of WebView-accessible storage.
**Tradeoff:** Loopback redirect needs a free local port and firewall-friendly behavior. Deep-link fallback adds registry setup in the installer.

### ADR-009 — Auth library self-hosted (Auth.js or Better Auth), not a paid identity SaaS
**Why:** Google and GitHub are the only providers needed. Sessions live in our Postgres. No per-MAU cost.
**Tradeoff:** We own session security, account linking, and token rotation. A managed IdP (Clerk/Auth0/WorkOS) would cut that work but adds cost and a vendor; we can revisit when SSO is needed. Final pick happens in the auth milestone after a spike.

### ADR-010 — Model provider abstraction with gateway; BYOK keys server-side, KMS envelope-encrypted
**Decision:** All model calls go through the API's model gateway. BYOK keys are submitted once, encrypted with a KMS-managed key, and only the last 4 characters are ever shown.
**Why:** It meets "keep keys out of browser code and logs", gives one place for redaction, usage metering, and provider routing, and lets hosted and BYOK share code.
**Tradeoff:** BYOK users must trust our server with their key. A desktop-held key mode is a post-V1 option, at the cost of moving model calls client-side.

### ADR-011 — Billing behind a `BillingProvider` interface; entitlements table is the source of truth
**Why:** Keeps the billing vendor decision open (Stripe vs a merchant of record such as Paddle or Lemon Squeezy, see pending decisions). Quota code never talks to the vendor.
**Tradeoff:** A thin abstraction to maintain. Webhook replay and ordering must be handled idempotently.

### ADR-012 — No mailbox or GitHub API integrations in V1
**Why:** Gmail restricted scopes require Google verification and a security assessment. Send capability contradicts "never send". Local repos avoid GitHub write scopes entirely.
**Tradeoff:** Users paste emails or pick `.eml` files, and repos must be cloned locally. Revisit with read-only scopes post-V1.

### ADR-013 — Monorepo: pnpm workspaces + Turborepo + Cargo workspace
**Why:** Shared DSL, UI, and types. Cached CI.
**Tradeoff:** More initial setup than separate repos.

---

### ADR-014 — Auth: `arctic` OAuth client + first-party sessions (resolves D7, amends ADR-009)
**Decision:** Use the small `arctic` library for the Google (PKCE) and GitHub authorization-code flows, with our own session layer in the API. Sessions are a random 256-bit token in an HttpOnly, SameSite=Lax cookie (`__Host-` and Secure on HTTPS). Only the SHA-256 of the token is stored in Postgres. Sessions expire after 30 days, renew past half-life, and rotate on every sign-in.
**Why:** We need two providers and full control over account linking, session rotation, and authorization tests. Auth.js and Better Auth bring their own schema and adapters plus a larger attack surface. The Lucia-style session model is about 100 lines, and its tests are easy to read.
**Tradeoff:** We own the session code, so the tests are its guarantee (`apps/api/src/auth.test.ts`). Adding more IdPs or SSO later is manual work.

### ADR-015 — Embedded PGlite for dev/test, Postgres in production
**Decision:** One Drizzle schema with SQL migrations in `packages/db/drizzle`. With `DATABASE_URL` unset, the API runs embedded PGlite (WASM Postgres) on disk or in memory. In production, `DATABASE_URL` is mandatory.
**Why:** A fresh clone can sign in, run tests, and use the demo with zero setup. Tests run against real Postgres semantics in-process, with no Docker.
**Tradeoff:** PGlite allows one connection per data directory, so external tools can't share the dev DB while the API runs. CI also runs the signed-in E2E suite on real Postgres 16 to catch driver differences.

### ADR-016 — Same-origin `/api` proxy from the website to the API
**Decision:** Next.js rewrites `/api/*` to the API service (`API_BASE_URL`). OAuth callbacks are `<APP_ORIGIN>/api/auth/<provider>/callback`.
**Why:** Session cookies stay first-party on the site origin with no CORS. The browser never learns the API's address. Secrets stay in the API process.
**Tradeoff:** One extra hop. `API_BASE_URL` is baked into the web build's rewrite table, so it must be set at build time. The desktop app will call the API directly with bearer tokens (M9), not cookies.

### ADR-017 — Explicit account linking only
**Decision:** A new provider identity whose verified email matches an existing account is **refused** (`account_exists`). Linking happens only through a signed-in, same-origin POST (`/auth/<provider>/link`). Unverified emails are rejected.
**Why:** Auto-linking by email lets anyone who controls an email at one IdP take over the account created at the other (threat model: account takeover via OAuth linking).
**Tradeoff:** Slight friction for users who try the second provider first. The sign-in page explains what to do.
