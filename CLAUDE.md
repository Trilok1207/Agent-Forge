# AgentFlow — instructions for Claude sessions

Product docs live in `docs/` (start at `docs/README.md`).

## Session rules
1. **Start of session:** inspect these instructions, the current branch, `git status`/working tree, recent log, and the prior docs (`docs/milestones.md`, `docs/decisions.md`, `docs/threat-model.md`, `docs/decisions-pending.md`).
2. **One milestone per session.** Do not start the next milestone's work.
3. **End of session:** inspect the full diff, run that milestone's checks (listed in `docs/milestones.md`), update docs (milestone status, ADRs, threat-model rows), then push. Push only after checks pass. If persistence is unclear, push before ending.

## Hard rules
- Never add credentials, real keys, or secret values to the repo. `.env.example` holds names only.
- Never pick paid vendors, create accounts, register OAuth apps, or deploy. Those are owner decisions (`docs/decisions-pending.md`).
- No step type, IPC command, or dependency may add: shell or process execution, email sending, git write operations, or unscoped file access. Any new capability needs an ADR and a threat-model row with a test.
- Provider keys never appear in client code, logs, errors, or API responses.
- Writes and external side effects always require explicit user approval bound to a content hash.
- Tests use FakeProvider by default; real vendor calls only behind an explicit manual flag.
- No test-only or dev-only login paths in application code. Missing OAuth credentials must never yield a session. Tests inject fake identity providers through `createApp` deps, or write sessions via test fixtures.
- Every workspace-scoped API route goes through `workspaceRole` (apps/api/src/authz.ts) and gets a cross-user test in `authz.test.ts`.
- Run status changes only through the engine's `transition()` (checked against `RUN_TRANSITIONS`). Never add an API that sets run, step, or approval state directly. Side effects run only via approved, hash-matched action approvals (docs/workflow-engine.md).
- `audit_events` is append-only and hash-chained. Write it only via `appendAuditEvent`/`audit()`, and never put content, prompts, outputs, or tokens in `detail`.
