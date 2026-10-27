# Workflow engine (Session 3)

The server-side foundation that every workflow (documents, email, repository, and future visual-builder flows) runs on. In Session 3 it executes a **deterministic mock executor** only: no models, files, network, or real writes.

Code:
- `packages/workflow`: pure logic (spec validation, state table, hashing, mock executor).
- `apps/api/src/engine`: persistence and orchestration.
- `apps/api/src/routes/engine.ts`: HTTP routes.

## Concepts

| Concept | What it is |
|---|---|
| **Workflow definition** | A named, workspace-owned workflow (`key` is unique per workspace). |
| **Version** | An immutable `WorkflowSpec` snapshot with its `specHash`. Editing means adding a version. A DB trigger blocks UPDATE. |
| **WorkflowSpec** | `{schemaVersion: 1, kind, name, description, steps[]}`. Steps come from the fixed step registry, use the same shape as planner output, and reject unknown keys. |
| **Run** | One execution of one version with a typed `input`. It has an explicit status and a `stateVersion` counter. |
| **Run step** | One row per spec step, in deterministic topological order, holding its status, output, and `outputHash`. |
| **Approval request** | A `plan` approval (one per run, before anything runs) or an `action` approval (one per side-effecting step, before it runs). It stores the exact `content` and its `contentHash`. |
| **Audit event** | Append-only, hash-chained record of every state change (ids, codes, and hashes only). |
| **Quota reservation** | A ledger row reserved at run creation, then settled (completed or failed) or released (cancelled). Nothing is charged. |

## Spec validation (server-side, `validateSpec`)

1. Schema: `WorkflowSpec`, strict. Unknown keys such as `command` or `webhook` are rejected. Step types must be in `STEP_REGISTRY`, which has no shell, network, git-write, or send steps. Ids match `^[a-z][a-z0-9_-]{0,39}$`. A spec has at most 20 steps.
2. Step ids are unique, dependencies exist, and no step depends on itself.
3. The graph is acyclic (Kahn's algorithm). Ties keep declaration order, so the execution order is deterministic.
4. A step's side effect comes from the **registry**, not from the spec. Every side-effecting step must have `requiresApproval: true` **and** a `review.preview` step among its ancestors ("preview before saving").

The stored spec is re-validated, and its hash re-checked, every time a run is created or advanced. A version tampered with in the database is refused (`invalid_workflow_version`).

## Run states

```
draft ─▶ planned ─▶ awaiting_plan_approval ─▶ queued ─▶ running ─▶ completed
  │         │               │                   │        │  ▲ │
  └─────────┴───────────────┴───────────────────┴──▶ cancelled ◀─┤
                                                         │  │ └──▶ failed
                                    awaiting_action_approval ◀┘
                                    awaiting_local_step (reserved for M9)
```

| From | Allowed to |
|---|---|
| draft | planned, cancelled |
| planned | awaiting_plan_approval, cancelled |
| awaiting_plan_approval | queued, cancelled |
| queued | running, cancelled |
| running | awaiting_action_approval, awaiting_local_step, completed, failed, cancelled |
| awaiting_action_approval | running, cancelled |
| awaiting_local_step | running, failed, cancelled |
| completed / failed / cancelled | — (terminal) |

- `RUN_TRANSITIONS` in `packages/workflow/src/states.ts` is the single source of truth. A test checks every (from, to) pair.
- **Only the engine's `transition()` changes a run's status.** It asserts the table and then compare-and-sets on `(status, stateVersion)`, so a stale or concurrent request fails with `409 run_state_conflict` instead of applying twice.
- No API route accepts a target status.
- Each transition writes a `run.transition` audit event.

Step statuses: `pending → succeeded | failed | awaiting_approval → succeeded | rejected`, and `skipped` (unfinished when the run ended).

## Execution model

Execution is **synchronous inside the request** that unblocks it: the plan approval, or an action approval. It happens in one DB transaction holding a row lock on the run.

1. **Create:**
   1. Validate the request and version.
   2. Reserve quota.
   3. Insert the run and its steps.
   4. Move `draft → planned`.
   5. Create the plan approval, whose content is the canonical JSON of the workflow key, version, spec hash, input, and ordered steps with their location and effect.
   6. Move `planned → awaiting_plan_approval`.
2. **Approve plan:** `→ queued → running`, then advance.
3. **Advance:** take the next pending step whose dependencies have succeeded.
   - **Read-only step:** `executor.run()` returns the output, the step becomes `succeeded`, and its `outputHash` is stored. If it throws, the step becomes `failed` with code `step_failed`, the run becomes `failed (step_failed:<key>)`, and the error message is **not** stored.
   - **Side-effecting step, no approval yet:**
     1. `executor.proposeAction()` returns `{title, destination, content}`.
     2. The engine creates an action approval with `sha256(content)`.
     3. The step becomes `awaiting_approval` and the run becomes `awaiting_action_approval`.
   - **Side-effecting step, approval exists:** the engine **re-checks** all of the following, then calls `executor.performAction()`:
     - the approval is `approved`;
     - the decider is a workspace member;
     - `sha256(content it would write now) == approved hash`.

     If any check fails, the run becomes `failed (approval_invalid)` and nothing is performed.
4. **Finish:** `completed` once all steps have succeeded. Any terminal transition skips unfinished steps, cancels pending approvals, and settles or releases the quota reservation.

A background worker (ADR-005, D8) replaces in-request execution when real model calls arrive. The state machine and tables don't change.

**Mock executor (`createMockExecutor`):** deterministic outputs from the synthetic demo data.
- Local steps return synthetic file lists; model steps return canned results.
- `proposeAction` returns the report, diff, or draft.
- `performAction` returns `{simulated: true, written: false}`.

The same spec and input give identical `outputHash`es and approval hashes (tested).

## Approvals and bypass protection

Approving requires sending the **hash of the content you were shown** (ADR-007):

```http
POST /v1/workspaces/{ws}/runs/{run}/approvals/{approval}
{"decision": "approve", "contentHash": "<64 hex>"}      or      {"decision": "reject", "reason": "..."}
```

The server checks, in order:
1. The caller is signed in and the request is same-origin.
2. The caller is a member of `{ws}`, and `{run}` belongs to `{ws}`. Otherwise 404.
3. `{approval}` belongs to `{run}`. Otherwise 404.
4. The approval is still pending:
   - the same decision repeated by the same user is an idempotent 200 replay;
   - a different decision is `409 approval_already_decided`.
5. The run is in the matching waiting state (`awaiting_plan_approval` or `awaiting_action_approval`), and the action's step is `awaiting_approval`. Otherwise `409 invalid_state`.
6. On approve:
   - `contentHash` equals the stored hash. Otherwise `409 content_hash_mismatch`.
   - The server **recomputes** the content from the current version, input, and prior outputs, and requires the same hash. Otherwise `409 content_changed`; this catches DB tampering.
7. The decision is compare-and-set from `pending` and audited, then execution continues.

There is no endpoint that sets run, step, or approval state directly (tests try PATCH, PUT, DELETE, `/resume`, `/advance`, `/steps/...`). The engine checks the approval again at execution time (step 3 above).

## Idempotency and duplicates

| Request | Behaviour |
|---|---|
| `POST /runs` | **Requires** `Idempotency-Key` (8–128 chars `[A-Za-z0-9_.:-]`).<br>• Scoped to (workspace, user, key).<br>• Same key and body: `200` with `Idempotent-Replayed: true` and the original run.<br>• Same key, different body: `422 idempotency_key_reused`.<br>• Concurrent duplicates: the unique index picks one winner; the others replay it. Exactly one run and one quota reservation (tested on Postgres). |
| Approval decision | Repeating the same decision returns a replay. Steps are not re-executed. |
| `POST /runs/{id}/cancel` | Cancelling an already-cancelled run returns a replay. Other terminal states return `409 invalid_transition`. |
| `POST /workflows/{id}/versions` | Submitting a spec identical to the latest version returns that version (`200`, replayed). It doesn't create a duplicate. |

## Quota hooks

`QuotaHooks { reserve, settle, release }` in `apps/api/src/quota.ts`. It is called inside the run's transaction.

- **Default `ledgerQuota`:** writes `quota_reservations` rows only. It takes an optional monthly run limit per workspace (`RUN_QUOTA_PER_MONTH`, unset means unlimited).
- **Race-free:** a per-workspace advisory lock makes the check race-free on Postgres (B8).
- **Denial:** returns `429 quota_exceeded`, and no run is created.
- **Usage recorded on settle:** `{runs, stepsSucceeded, stepsExecutedThisCall}`.
- **Charging:** none, and no external calls. Billing (M13) will supply entitlements through this interface.

## Audit log

- `audit_events` is **append-only**: a trigger rejects UPDATE, DELETE, and TRUNCATE. Actor and workspace ids are plain values (no FKs), so user deletion can't rewrite history.
- Each row stores `prev_hash` and `hash = sha256(canonical{prev, id, at, actor, workspace, action, detail})`. Appends hold a transaction advisory lock, so the chain can't fork.
- `verifyAuditChain(db)` recomputes the chain. It reports tampering even if a superuser disables the trigger (tested). Rows from before Session 3 form an unhashed legacy prefix.
- Details hold ids, codes, statuses, and hashes. They never hold approval content, outputs, or tokens (tested).

## HTTP API

All routes are under `/v1/workspaces/{workspaceId}`. Every route requires a session, every POST requires a same-origin `Origin` header, and every route requires workspace membership; foreign or unknown ids return 404. Bodies are capped at 64 KB. Errors use `{error: {code, message, details?}}`.

| Method & path | Body | Success |
|---|---|---|
| `GET /workflows` | — | `200 {workflows: WorkflowInfo[]}` |
| `POST /workflows` | `{key, name, spec}` | `201 WorkflowDetail`; `409 workflow_key_taken`; `422 invalid_spec {details}` |
| `GET /workflows/{id}` | — | `200 WorkflowDetail` (versions, newest first) |
| `POST /workflows/{id}/versions` | `{spec}` | `201 WorkflowVersionInfo`, or `200` replay if unchanged; `422` if invalid or the kind changed |
| `GET /runs` | — | `200 {runs}` (latest 100, without steps or approvals) |
| `POST /runs` + `Idempotency-Key` | `{workflowId, version?, input: {projectId?, note?}}` | `201 RunInfo` or `200` replay; `400 idempotency_key_required`; `404 workflow_not_found` / `version_not_found`; `422 project_not_found` / `invalid_request` / `idempotency_key_reused`; `429 quota_exceeded` |
| `GET /runs/{id}` | — | `200 RunInfo` (steps, approvals with content and hash) |
| `POST /runs/{id}/approvals/{approvalId}` | `ApprovalDecisionRequest` | `200 RunInfo`; `409 content_hash_mismatch` / `content_changed` / `approval_already_decided` / `invalid_state` / `run_state_conflict` |
| `POST /runs/{id}/cancel` | — | `200 RunInfo`; `409 invalid_transition` if completed or failed |

All shapes are Zod schemas in `packages/contracts/src/engine.ts`.

## Data model

| Table | Key columns | Notes |
|---|---|---|
| `workflow_definitions` | `id, workspace_id, key, name, kind, is_demo, created_by` | unique `(workspace_id, key)`; three demo workflows seeded per workspace (and backfilled on API start) |
| `workflow_versions` | `id, definition_id, version, spec jsonb, spec_hash` | unique `(definition_id, version)`; **UPDATE blocked by trigger** |
| `workflow_runs` | `id, workspace_id, definition_id, version_id, created_by, status, state_version, input, idempotency_key, request_hash, error_code, quota_reservation_id, completed_at` | unique `(workspace_id, created_by, idempotency_key)` |
| `run_steps` | `id, run_id, key, position, type, title, status, output jsonb, output_hash, error_code, started_at, finished_at` | unique `(run_id, key)` |
| `approval_requests` | `id, run_id, step_id, kind, status, title, destination, content, content_hash, decided_at, decided_by, reason` | partial unique: one `plan` per run, one `action` per step |
| `quota_reservations` | `id, workspace_id, user_id, kind, amount, status, usage, closed_at` | ledger only |
| `audit_events` | `id, seq, at, actor_user_id, workspace_id, action, detail, prev_hash, hash` | **append-only**, hash-chained |

Migration: `packages/db/drizzle/0001_workflow_engine.sql`. The triggers are hand-written at the end of that file.

## Not in this session
- Visual editor and web UI for runs (the API is ready).
- Natural-language planning (M7).
- Real model calls (M5).
- Desktop local steps (`awaiting_local_step`, M9).
- Background worker.
- Billing.
