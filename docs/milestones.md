# Milestone plan

**One milestone per session.** Each session follows the rules in [`/CLAUDE.md`](../CLAUDE.md): inspect first; at the end, inspect the diff, run the milestone's checks, update docs, push only when checks pass.
Boundary IDs (B1–B12) refer to [threat-model.md](threat-model.md).

| # | Milestone | Deliverables | Checks (gate to push) |
|---|---|---|---|
| **M0** ✅ | Product & architecture *(Session 0)* | Scope, ADRs, threat model, milestones, setup notes | Docs agree on scope and trust boundaries; no app code changed |
| **— Gate** | Owner review | Owner signs off decisions and resolves [decisions-pending.md](decisions-pending.md) (brand, providers, billing, hosting) | Written sign-off in `decisions-pending.md` |
| **M1** ✅ | Monorepo scaffold *(Session 1, see note)* | pnpm/Turborepo workspace, Cargo workspace, TS/ESLint/Prettier configs, Vitest, CI (lint, typecheck, test, `cargo fmt/clippy/test`, audit), `.env.example` with names only, secret-scanning hook | CI green; `pnpm lint typecheck test`; `cargo clippy -D warnings`; no secrets in tree |
| **M2** | Workflow DSL + policy engine | `packages/workflow`: schema, step registry, validator, policy engine, plain-language plan renderer | Unit + property tests; registry snapshot test (B6); injection plan fixtures rejected (B5); ≥90% coverage on policy |
| **M3** ◐ | API core, DB, audit, quota primitives *(DB/migrations/audit table done in Session 2)* | `apps/api`, `packages/db` migrations, health route, audit hash chain, reserve/settle quota functions, local Postgres via Docker Compose | Migration up/down test; B8 concurrency test; B10 role + chain tests; API contract tests |
| **M4** ✅ | Authentication *(Session 2, web part)* | Google + GitHub OAuth (web), sessions, CSRF, account linking, desktop PKCE code-exchange endpoints, device list/revoke | Auth flow integration tests with mocked IdPs; B11 IDOR test harness; session rotation tests |
| **M5** | Model gateway (hosted) | `packages/models` interface, FakeProvider, first real adapter (owner-chosen vendor), routing table, usage ledger, log redaction | Canary-key leak test (B7); adapter contract tests against FakeProvider; real-vendor smoke test behind manual flag |
| **M6** | BYOK | Key submit/rotate/delete, KMS envelope encryption (local dev uses a dev-only KEK), last-4 display, BYOK quota accounting | B7 re-run incl. error paths; encrypted-at-rest test; key never in any API response |
| **M7** | Planner + run orchestration + approvals | NL → plan, validation, plan-approval flow, worker execution, run state machine, action approvals with content hash | State machine tests; approval hash tests (B3 server side); planner eval set (golden requests → valid plans) |
| **M8** | Web app + safe demo | Responsive Next.js: landing, sign-in, dashboard, request box, plan review, run view, audit viewer, pasted-email workflow, demo project with synthetic data | Playwright E2E (mobile + desktop viewports); accessibility checks (axe); B12 demo test |
| **M9** | Desktop shell + grants | Tauri v2 app, Windows build, system-browser sign-in, Credential Manager storage, grant registry, local-step pull loop, capability lock-down | `crates/agentflow-local` path tests (B1); capability snapshot (B2); Windows CI build; manual sign-in smoke test |
| **M10** | Documents workflow | Extractors (txt/md/csv/pdf-text/docx), file-list preview before send, summarize/extract steps, preview + approved save | Extractor fixtures; B3 tamper test; E2E on demo docs; size-cap tests |
| **M11** | Email workflow | `.eml` parsing + pasted text, summarize/classify/draft, copy/save draft with approval | Parser fixtures (MIME, encodings); assertion that no send path exists (B6); E2E |
| **M12** | Repository workflow | Repo snapshot (gitignore, denylist, caps), analysis, diff proposal, diff viewer, export `.patch`, approved apply-to-working-tree | Malicious diff corpus (B4); pre-image staleness (B3); no-git-write/no-process test (B2); E2E on demo repo |
| **M13** | Billing + entitlements | `BillingProvider` impl (owner-chosen vendor), monthly/yearly checkout, portal, webhooks → entitlements, quota UI | B9 webhook tests; plan change → quota change test; vendor test-mode E2E |
| **M14** | Hardening & packaging | Security review against threat model, rate limits, CSP review, signed Windows installer + signed updater, observability (no content), privacy/ToS pages (owner-supplied text) | Every B1–B12 row has a passing test; `pnpm audit`/`cargo audit` clean; installer smoke test on clean Windows VM |
| **M15** | Staged release | Feature flags, internal alpha → closed beta → paid beta → GA runbook, rollback plan | Release checklist complete; owner approval per stage |

### Session 1 note
Session 1 delivered M1, plus a **mock-only** preview of parts of M8 and M9, at the owner's request:
- **Done:** the M1 scaffold. Also the responsive landing page, a `/demo` mock workspace (synthetic data, simulated plan → approve → audit, no network), a `/sign-in` placeholder, and a branded Tauri shell with minimal capabilities. CI includes a Windows installer build and launch smoke test.
- **Still open in M8:** real NL request handling, Playwright E2E, axe checks, and B12 enforcement against the real API.
- **Still open in M9:** sign-in, Credential Manager, the grant registry, `crates/agentflow-local`, and the local-step loop.
- **Deferred from M1:** gitleaks (a script-based secret check covers it for now), and `cargo audit`/`cargo deny` and `pnpm audit` in CI (planned for M14, can be pulled forward).
- **Gate for Session 1:** a fresh setup follows the README, the web build works, the Tauri shell launches on Windows, and the demo uses mock data. The Windows launch is verified by the `windows-desktop` CI job, since the session environment is Linux.

### Session 2 note
- **Done (M4, web):**
  - Google and GitHub OAuth (PKCE on Google, state and a one-shot flow cookie on both).
  - Hashed server-side sessions with rotation, expiry, and sliding renewal.
  - Origin-checked CSRF defence, explicit account linking, and sign-out.
  - Session list and revoke; the Account, Workspace, and Project screens.
  - Workspace ownership with a membership-based authorization gate.
- **Done (M3, part):** `packages/db` (Drizzle schema plus SQL migrations), PGlite for dev/test, Postgres in production, and an `audit_events` table recording sign-in, sign-out, link, revoke, and creation events.
- **Seeded demo:** each new workspace gets the synthetic Demo project. The public `/demo` still needs no API, account, or credentials.
- **Still open:**
  - M4 desktop PKCE code exchange and the device list (moved to M9).
  - M3 audit hash chain, append-only DB role, quota reserve/settle, and migration down-tests.
  - Rate limiting on `/auth/*` (M14).
- **Checks:** `pnpm check`, `pnpm check:rust`, and Playwright E2E. The public suite runs on PGlite; the signed-in suite needs Postgres via `E2E_DATABASE_URL`.

## Release stages
1. **Internal alpha.** Owner only, hosted mode, FakeProvider plus one vendor. Demo and all three workflows.
2. **Closed beta.** Invite list. Free tier only. Hosted quotas small. Feedback on approvals UX.
3. **Paid beta.** Billing live in vendor live mode. BYOK enabled.
4. **GA.** Public download page, signed auto-update channel.

Each stage goes ahead only with owner approval; nothing is deployed automatically by a session.

## Post-V1 backlog (not scheduled)
Visual workflow builder (edits same DSL) · macOS/Linux builds · read-only Gmail/Outlook import · GitHub read-only repo import · teams/orgs · desktop-held BYOK keys · durable workflow engine · OCR.
