# Developer setup notes

Status: **Active since Session 1.** Quick start lives in the root [README](../README.md); this page holds the details.

## Prerequisites
| Tool | Purpose | Notes |
|---|---|---|
| Node.js LTS + Corepack (pnpm) | web, API, worker, packages | `corepack enable` |
| Rust stable (rustup) + `cargo-audit`, `cargo-deny` | Tauri core, `crates/agentflow-local` | `rustup component add clippy rustfmt` |
| Docker (or local Postgres) | Postgres for API/worker in dev | Docker Compose file added in M3 |
| **Windows only (desktop builds):** Visual Studio Build Tools (MSVC, Windows SDK), WebView2 runtime | Tauri on Windows | WebView2 ships with Windows 11; installer bootstraps it on Windows 10 |
| Playwright browsers | Web E2E | Installed via the project's pinned Playwright |

Web, API, and shared packages can be developed on Windows, macOS, or Linux. **Desktop builds and desktop E2E must run on Windows** (local machine or Windows CI runner).

## Pinned toolchain (Session 1)
| Tool | Version |
|---|---|
| Node.js | ≥ 22 (`engines`, `engine-strict`) |
| pnpm | 10.28.0 (`packageManager`, via Corepack) |
| TypeScript | 5.9 |
| Next.js | 16.4.3 (App Router, Tailwind CSS v4) |
| Tauri | 2.x (CLI 2.12, Rust crate `tauri = "2"`); Vite 8 + React 19 frontend |
| ESLint | 9 (flat config; ESLint 10 is not yet supported by `eslint-config-next` plugins) |
| Test runner | Vitest 4 (+ jsdom 29 / Testing Library for UI) |

## Commands
```
pnpm install
pnpm dev                 # web (3000) + api (8787)
pnpm dev:desktop         # Tauri dev window (Vite on 127.0.0.1:1420)
pnpm check               # secrets, format, lint, typecheck, test, build
pnpm check:rust          # cargo fmt/clippy/test (run `pnpm build` once first)
pnpm build:desktop       # unsigned NSIS + MSI installers (Windows)
```

## Windows desktop notes
- Install **Visual Studio Build Tools** with the "Desktop development with C++" workload and **Rust** via rustup (MSVC toolchain, the default on Windows).
- WebView2 ships with Windows 11; on Windows 10 the installer bootstraps it (`webviewInstallMode: downloadBootstrapper`).
- `pnpm build:desktop` produces **unsigned** installers. Windows SmartScreen will warn until a code-signing certificate is configured (owner blocker, M14).
- MSI bundling uses WiX, which the Tauri CLI downloads on first use.

## Linux notes (web/API work, Rust checks)
`cargo clippy/test` on Linux need WebKitGTK headers: `libwebkit2gtk-4.1-dev libgtk-3-dev librsvg2-dev libayatana-appindicator3-dev` (Debian/Ubuntu). `tauri::generate_context!` also needs `apps/desktop/dist` to exist, so run `pnpm build` once first.

## Desktop shell boundaries (Session 1)
- Capabilities: `core:app:allow-version`, `core:app:allow-name` only. No plugins (no fs, shell, process, http, dialog).
- No custom IPC commands. Strict CSP (`script-src 'self'`, no `unsafe-eval`).
- Rust tests in `apps/desktop/src-tauri/src/lib.rs` pin these (B2 groundwork).

## Configuration and secrets
- `.env.example` lists **variable names only**, never values. Real values live in a local untracked `.env` and, in deployed environments, in the hosting provider's secret store.
- Dev mode defaults to **FakeProvider**, so no model key is needed to run the app or tests.
- OAuth dev apps (Google, GitHub), billing test-mode keys, and a dev KEK for BYOK encryption are created by the owner. Sessions must **not** create accounts, register apps, or add credentials.
- Provider keys are never referenced from `apps/web` client code. A lint rule plus a CI grep blocks `NEXT_PUBLIC_*KEY*`/`*SECRET*` names.
- `pnpm check:secrets` (scripts/check-secrets.mjs) runs locally and in CI. A full scanner such as gitleaks can be added later if wanted.

## Conventions
- Branch per session; commits small and descriptive; push only after milestone checks pass.
- Any new step type, effect, scope, or vendor needs an ADR in `docs/decisions.md` and a row in `docs/threat-model.md`.
- Tests may not call real vendors by default. Real-vendor smoke tests require an explicit flag and are run manually.
