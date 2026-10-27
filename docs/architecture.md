# Architecture

Status: **Proposed — awaiting owner review.** The reasoning for each choice is in [decisions.md](decisions.md). Trust boundaries are in [threat-model.md](threat-model.md).

## System overview

```
                 ┌───────────────────────────── Cloud (trusted zone) ─────────────────────────────┐
 Browser ──HTTPS──▶  Web (Next.js)  ──server-side──▶  API service  ──▶  Postgres (state, audit,   │
 (no secrets)    │   BFF/session cookie               │  ▲              quotas, entitlements)       │
                 │                                    ▼  │                                          │
                 │                              Worker (job queue in Postgres)                    │
                 │                                    │                                           │
                 │                       Model gateway ──▶ Provider adapters ──▶ LLM vendors      │
                 │                       (keys from secret store / KMS-encrypted BYOK)            │
                 │   Billing webhooks ──▶ API (signature-verified) ──▶ entitlements               │
                 └────────────────────────────────────▲──────────────────────────────────────────┘
                                                      │ HTTPS, bearer token (desktop session)
 ┌──────────────── User's Windows PC ─────────────────┴────────────────────────────┐
 │  Tauri app                                                                       │
 │   WebView UI (React)  ──IPC (allow-listed commands only)──▶  Rust core           │
 │                                                              • grant registry    │
 │                                                              • file readers/extractors
 │                                                              • diff/patch applier│
 │                                                              • token in Credential Manager
 │   User-picked files/folders  ◀── read only within grants; writes only after approval
 └──────────────────────────────────────────────────────────────────────────────────┘
```

## Components

| Component | Tech (proposed) | Responsibility |
|---|---|---|
| `apps/web` | Next.js (App Router), React, TypeScript, Tailwind | Marketing, auth UI, billing portal links, run history, audit viewer, web demo, pasted-email workflow. Server components/route handlers call the API with the session. Holds no provider keys. |
| `apps/api` | TypeScript, Hono on Node, Zod | Auth sessions/tokens, workflow plans and runs, approvals, quotas, audit writes, billing webhooks, BYOK key management. **The only component allowed to decrypt keys or call the model gateway.** |
| `apps/worker` | Same codebase as the API, separate process | Executes cloud steps of a run from a Postgres-backed job queue (pg-boss or Graphile Worker). Retries are idempotent per step. |
| `apps/desktop` | Tauri v2 (Rust core + React UI shared with web components) | File/folder selection, grant registry, content extraction, local step execution, previews, diff review, approved writes. |
| `packages/contracts` | TypeScript + Zod | Workflow DSL schema, step registry, run status, API request/response shapes. Shared by every app. |
| `packages/workflow` | TypeScript | Spec validator (DAG, registry, approval rules), run-state table, canonical hashing, and the deterministic mock executor (Session 3). The policy engine grows here in M2. |
| `packages/demo-data` | TypeScript | Synthetic demo project: inputs, plans, and mock results. Used by the web and desktop demo. |
| `packages/models` | TypeScript | `ModelProvider` interface, adapters, fake provider for tests, token accounting. Server-only. |
| `packages/db` | Drizzle ORM + SQL migrations | Schema, migrations, query helpers. |
| `packages/ui` | React | Shared components: plan view, approval dialog, diff viewer, preview. |
| `crates/agentflow-local` | Rust | Path canonicalization, grant checks, extractors, patch validation and apply. Unit tested independently of Tauri. |

## Workflow model

The general architecture. V1 workflows are configurations of it, not special cases.

1. **Request.** The user writes a request in natural language and optionally attaches *grant handles* (opaque IDs for files/folders they picked).
2. **Plan.** The API asks the planner model to produce a `WorkflowPlan` in the **workflow DSL**: a JSON document validated against a schema. A plan is a small DAG of steps. Each step names a `type` from a **fixed step registry**. The plan is *data, never code*.
3. **Validate.** The policy engine rejects any plan that uses unknown step types, references grants the user didn't attach, exceeds plan or quota limits, or contains a side-effecting step without an approval gate.
4. **Approve plan.** The user sees the plan in plain language (steps, which files, where each step runs, what it may write). Nothing runs until they approve.
5. **Execute.** Cloud steps run in the worker. Local steps are *pulled* by the desktop app (see below). Outputs are stored as run artifacts (encrypted at rest, with a retention limit).
6. **Approve action.** Any step with `effect != none` pauses the run in `awaiting_action_approval` and shows a preview or diff. Approval is per action, bound to a hash of the exact content to be written.
7. **Complete.** The run ends as `completed`, `failed`, or `cancelled`. Audit events are written at every transition.

### Step registry (V1)

| Step type | Runs | Effect | Notes |
|---|---|---|---|
| `local.read_grant` | desktop | none | Reads/extracts text from a granted file or folder. Applies size caps and ignore/deny lists. |
| `local.repo_snapshot` | desktop | none | File tree + selected file contents of a granted repo, read-only, honoring `.gitignore` and a secrets denylist. |
| `input.pasted_text` | web/desktop | none | Text supplied in the request (e.g. emails). |
| `model.summarize` / `model.extract` / `model.classify` / `model.draft_reply` / `model.analyze_code` / `model.propose_diff` | cloud | none | Prompt templates owned by us. Structured outputs validated by schema. |
| `review.preview` | client | none | Shows output to the user. |
| `local.save_file` | desktop | `local_write` | Writes to a path picked in a save dialog *at approval time*. |
| `local.apply_patch` | desktop | `local_write` | Applies a validated unified diff inside the granted repo root. |
| `local.export_patch` | desktop | `local_write` | Saves a `.patch` file via save dialog. |
| `client.copy_to_clipboard` | client | `local_write` | Still confirmed by the user. |

There are **no** step types for shell, network, git writes, or email sending. New effects need an ADR and a threat-model update.

### Run state machine

`draft → planned → awaiting_plan_approval → queued → running ⇄ awaiting_local_step / awaiting_action_approval → completed | failed | cancelled`

The API owns all state transitions. Clients request transitions; the server validates them. Implemented in Session 3: see [workflow-engine.md](workflow-engine.md) for the exact table, approval checks, idempotency, and the data model.

### Visual builder (post-V1)

The builder will edit the same `WorkflowPlan` DSL. Plans from either source go through the same validator, policy engine, and approval flow. V1 stores plans in a versioned format (`schemaVersion`) so this stays additive.

## Local execution protocol (desktop ↔ cloud)

- **Grants are created only by the user** through native file/folder dialogs. The Rust core stores a grant as `{id, canonical_path, kind(file|folder|repo), mode(read), created_at}` in a local store. The cloud only ever sees the opaque `grant_id`, a display name, and file counts and sizes. **The cloud never sends a path.**
- The desktop **pulls** pending local steps for runs it started (`GET /runs/:id/local-steps`). The cloud cannot push commands. Each step references only grant IDs attached to that run.
- The Rust core re-checks every read against the grant: canonicalize, reject symlink/junction escape, reject paths outside the grant root, enforce size and type caps, apply the denylist (`.env*`, `*.pem`, `*.key`, `id_*`, `.git/`, credential stores).
- Extracted content is sent to the API for model steps. **This is disclosed in the UI**: content leaves the machine for the model vendor (or the user's BYOK vendor).
- Writes happen only after an approval the user gave in the desktop UI. The core checks the approval's content hash against the bytes it is about to write. For patches it also checks that target files still match the pre-image hash.
- Tauri configuration: no shell plugin, no `fs` plugin scopes beyond dialog-returned paths, strict CSP, and an IPC command allow-list defined in Tauri capabilities.

## Auth

- **Web (built in Session 2):** the browser calls `/api/*` on the site origin, and Next.js proxies it to the API (ADR-016).
  - The API runs the OAuth authorization-code flows with `arctic` (Google with PKCE; GitHub with state). It keeps state, the verifier, and the next path in a 10-minute one-shot HttpOnly cookie.
  - Users must have a verified email. Accounts link only through an explicit flow (ADR-017).
  - The session token lives in an HttpOnly, SameSite=Lax cookie (`__Host-` + Secure on HTTPS); only its hash is stored (ADR-014).
  - Every unsafe method requires `Origin == APP_ORIGIN`.
  - Workspace-scoped reads go through one membership gate (`workspaceRole`). Foreign or unknown ids return 404.
- **Desktop:** opens the system browser to the web sign-in, then completes through a **loopback redirect with PKCE** (custom-scheme deep link as a fallback). This yields a one-time code, exchanged for a short-lived access token plus a rotating refresh token. The refresh token is stored in **Windows Credential Manager** (Rust `keyring`), not in WebView storage.
- **GitHub scopes:** `read:user user:email` only.

## Model provider abstraction

```ts
interface ModelProvider {
  id: string;                       // "anthropic", "openai", ...
  generate(req: GenerateRequest, ctx: CallContext): Promise<GenerateResult>; // text or JSON-schema output
  countTokens?(req: GenerateRequest): Promise<number>;
}
```
- A **model gateway** in the API picks the provider and model per step from a server-side routing table. It resolves the key (hosted: secret store; BYOK: decrypt the user's key with KMS envelope encryption, in memory, per call), calls the adapter, and records usage.
- Hosted and BYOK use the same adapters. The only difference is key source and quota accounting: BYOK counts runs, not tokens.
- Keys never go to the browser, the desktop, logs, error messages, traces, or audit records. A redaction layer in the logger plus tests enforce this.
- A `FakeProvider` with deterministic fixtures is used in all automated tests and the offline demo.

## Quotas and billing

- The billing provider is behind a `BillingProvider` interface: checkout session, customer portal, webhook verification. Webhooks update an `entitlements` table. **Entitlements are the only input to quota checks.**
- Quota enforcement is **reserve-then-settle**: before a run is queued, reserve an estimated amount in one transaction with a conditional update. Settle with actual usage when the run ends. A reservation expires if the run dies.
- Period boundaries follow the subscription period, monthly or yearly. Usage limits reset monthly even on yearly plans.

## Data (initial sketch)

**Implemented (`packages/db/src/schema.ts`):**
- Session 2: `users, oauth_accounts, sessions, workspaces, workspace_members, projects, project_items`.
- Session 3: `workflow_definitions, workflow_versions, workflow_runs, run_steps, approval_requests, quota_reservations`, plus `audit_events`, now append-only and hash-chained.

**Planned:** `desktop_devices, refresh_tokens, entitlements, subscriptions, provider_keys (encrypted), artifacts (encrypted, TTL)`.

`audit_events` is insert-only for the app's DB role. Each row stores `prev_hash` so tampering is detectable. Rows store IDs, hashes, sizes, and decisions, **not file contents, prompts, or keys**.

## Repo layout

As built in Session 1:
```
apps/{web,api,desktop}            # desktop = Vite/React UI + src-tauri (Rust)
packages/{contracts,db,demo-data,ui,workflow}
docs/  scripts/
```
To be added in later milestones: `apps/worker` (M7), `packages/models` (M5), and `crates/agentflow-local` (M9). `packages/workflow` (Session 3) holds spec validation, the state table, and the mock executor.
`packages/contracts` holds the shared Zod schemas: the workflow DSL, the step registry, and API shapes. It is the single source of truth that `workflow`, `api`, `web`, and `desktop` import.
pnpm workspaces + Turborepo; Cargo workspace at the repo root.
