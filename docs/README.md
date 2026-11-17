# AgentFlow docs

| Doc | Contents |
|---|---|
| [product-scope.md](product-scope.md) | V1 scope, workflows, non-goals, success criteria |
| [architecture.md](architecture.md) | Components, workflow model, local execution protocol, auth, models, quotas, data |
| [decisions.md](decisions.md) | Architecture decision records (ADR-001…024) with tradeoffs |
| [threat-model.md](threat-model.md) | Assets, trust zones, permission boundaries B1–B15, threats |
| [milestones.md](milestones.md) | M0–M15 plan with per-milestone checks; release stages |
| [workflow-engine.md](workflow-engine.md) | Engine API, data model, run states, approvals, idempotency, quota hooks, audit chain |
| [models-and-planning.md](models-and-planning.md) | Model gateway, BYOK key handling, redaction, NL → plan review flow, API |
| [auth-setup.md](auth-setup.md) | Google/GitHub OAuth app setup, callback URLs (placeholders), account rules |
| [dev-setup.md](dev-setup.md) | Toolchain, commands, Windows/Linux notes, secret handling |
| [decisions-pending.md](decisions-pending.md) | Assumptions, owner decisions, blockers, sign-off |

**Current status:** Sessions 0–4 are complete. Session 4 added the provider-neutral model gateway (mock provider only), BYOK key encryption, and natural-language planning into reviewed drafts that fail closed. **Blocked on the owner:** D2 (model vendor) and D6 (KMS) before any real model call.
