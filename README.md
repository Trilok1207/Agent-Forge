# AgentFlow

Natural-language workflows that ask before they act. A Windows-first Tauri desktop app plus a responsive Next.js website. Cloud services plan the work and call models; the desktop app touches only files you pick, and nothing is written, sent, or pushed without your approval.

> Working name: **AgentFlow** (brand decision D1 is still open — see [docs/decisions-pending.md](docs/decisions-pending.md)). This repo previously described an "AgentForge" learning/portfolio site; that direction is superseded by the docs in [`docs/`](docs/README.md) pending the owner's decision.

**Status:** Session 1 — monorepo, landing page, mock demo workspace, and a minimal desktop shell. No real auth, payments, model calls, or local file access yet.

## Repository layout

```
apps/
  web/        Next.js website: landing page, /demo (mock workspace), /sign-in (placeholder)
  api/        Backend service (Hono on Node): /health only for now
  desktop/    Tauri v2 Windows app: Vite + React UI in src/, Rust in src-tauri/
packages/
  contracts/  Shared Zod schemas: workflow DSL, step registry, run status, API shapes
  demo-data/  Synthetic demo project (documents, emails, sample repo) — mock data only
  ui/         Shared React UI + design tokens: logo, DemoWorkspace, approval dialog
docs/         Product scope, architecture, ADRs, threat model, milestones, setup notes
scripts/      check-secrets.mjs
```

## Fresh setup

Prerequisites: **Node.js ≥ 22** with Corepack, **Git**. For the desktop app also: **Rust (stable, via rustup)** and, on Windows, **Visual Studio Build Tools** ("Desktop development with C++") and **WebView2** (preinstalled on Windows 11). Details: [docs/dev-setup.md](docs/dev-setup.md).

```bash
git clone <this repo> && cd Agent-Forge
corepack enable            # provides the pinned pnpm version
pnpm install
```

No `.env` file is needed for Session 1 — everything runs on bundled mock data. `.env.example` files list variable **names only** for later milestones.

### Run

| Command | What it does |
|---|---|
| `pnpm dev:web` | Website at http://localhost:3000 (demo at `/demo`) |
| `pnpm dev:api` | API at http://127.0.0.1:8787 (`GET /health`) |
| `pnpm dev` | Web + API together |
| `pnpm dev:desktop` | Desktop app in dev mode (Windows; also works on macOS/Linux with Tauri prerequisites) |
| `pnpm build:desktop` | Unsigned Windows installers (`target/release/bundle/{nsis,msi}`) |

### Check

| Command | What it does |
|---|---|
| `pnpm check` | Secret scan, Prettier check, ESLint, TypeScript, unit tests, production builds |
| `pnpm check:rust` | `cargo fmt --check`, `clippy -D warnings`, `cargo test` (needs the desktop frontend built once: `pnpm build`) |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` | Individual steps (Turborepo) |
| `pnpm format` | Apply Prettier |
| `pnpm check:secrets` | Fail on committed `.env` files, values in `.env.example`, secret-looking `NEXT_PUBLIC_`/`VITE_` names, and common key patterns |

CI (`.github/workflows/ci.yml`) runs the JS checks, the Rust checks on Linux, and builds the Windows installers on `windows-latest` with a launch smoke test.

## Safety rules for contributors

See [`CLAUDE.md`](CLAUDE.md) and [docs/threat-model.md](docs/threat-model.md). In short: no secrets in the repo; no shell/process, email-send, git-write, or unscoped file capabilities; every write needs approval bound to a content hash.

## License

MIT — see [LICENSE](LICENSE).
