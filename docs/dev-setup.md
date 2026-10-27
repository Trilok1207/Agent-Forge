# Developer setup notes

Status: **Planned.** Nothing here is installable yet; the scaffold arrives in M1. Versions are "current stable at M1" and get pinned then.

## Prerequisites
| Tool | Purpose | Notes |
|---|---|---|
| Node.js LTS + Corepack (pnpm) | web, API, worker, packages | `corepack enable` |
| Rust stable (rustup) + `cargo-audit`, `cargo-deny` | Tauri core, `crates/agentflow-local` | `rustup component add clippy rustfmt` |
| Docker (or local Postgres) | Postgres for API/worker in dev | Docker Compose file added in M3 |
| **Windows only (desktop builds):** Visual Studio Build Tools (MSVC, Windows SDK), WebView2 runtime | Tauri on Windows | WebView2 ships with Windows 11; installer bootstraps it on Windows 10 |
| Playwright browsers | Web E2E | Installed via the project's pinned Playwright |

Web, API, and shared packages can be developed on Windows, macOS, or Linux. **Desktop builds and desktop E2E must run on Windows** (local machine or Windows CI runner).

## Planned commands (M1+)
```
pnpm install
pnpm dev            # web + api + worker against local Postgres
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter desktop tauri dev      # Windows
cargo test -p agentflow-local
```

## Configuration and secrets
- `.env.example` lists **variable names only**, never values. Real values live in a local untracked `.env` and, in deployed environments, in the hosting provider's secret store.
- Dev mode defaults to **FakeProvider**, so no model key is needed to run the app or tests.
- OAuth dev apps (Google, GitHub), billing test-mode keys, and a dev KEK for BYOK encryption are created by the owner. Sessions must **not** create accounts, register apps, or add credentials.
- Provider keys are never referenced from `apps/web` client code. A lint rule plus a CI grep blocks `NEXT_PUBLIC_*KEY*`/`*SECRET*` names.
- A pre-commit secret scanner (e.g. gitleaks) runs from M1.

## Conventions
- Branch per session; commits small and descriptive; push only after milestone checks pass.
- Any new step type, effect, scope, or vendor needs an ADR in `docs/decisions.md` and a row in `docs/threat-model.md`.
- Tests may not call real vendors by default. Real-vendor smoke tests require an explicit flag and are run manually.
