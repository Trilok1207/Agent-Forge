# AgentFlow docs

| Doc | Contents |
|---|---|
| [product-scope.md](product-scope.md) | V1 scope, workflows, non-goals, success criteria |
| [architecture.md](architecture.md) | Components, workflow model, local execution protocol, auth, models, quotas, data |
| [decisions.md](decisions.md) | Architecture decision records (ADR-001…021) with tradeoffs |
| [threat-model.md](threat-model.md) | Assets, trust zones, permission boundaries B1–B14, threats |
| [milestones.md](milestones.md) | M0–M15 plan with per-milestone checks; release stages |
| [workflow-engine.md](workflow-engine.md) | Engine API, data model, run states, approvals, idempotency, quota hooks, audit chain |
| [auth-setup.md](auth-setup.md) | Google/GitHub OAuth app setup, callback URLs (placeholders), account rules |
| [dev-setup.md](dev-setup.md) | Toolchain, commands, Windows/Linux notes, secret handling |
| [decisions-pending.md](decisions-pending.md) | Assumptions, owner decisions, blockers, sign-off |

**Current status:** Sessions 0–3 are complete. Session 3 added the workflow engine foundation: versioned definitions, runs, hash-bound approvals, idempotency, quota hooks, and an append-only audit chain, running a deterministic mock executor. Next: model gateway (M5) or UI for runs, per the owner's plan. The owner decisions in decisions-pending.md are still open.
