# AgentFlow

Natural-language workflows that ask before they act. A Windows-first Tauri desktop app plus a responsive Next.js website. Cloud services plan the work and call models; the desktop app touches only files you pick, and nothing is written, sent, or pushed without your approval.

> Working name: **AgentFlow** (brand decision D1 is still open — see [docs/decisions-pending.md](docs/decisions-pending.md)). This repo previously described an "AgentForge" learning/portfolio site; that direction is superseded by the docs in [`docs/`](docs/README.md) pending the owner's decision.

**Status:** Session 2. Google/GitHub sign-in (disabled until OAuth apps are registered), server-side sessions, workspaces with a seeded demo project, and account screens. Also the landing page, the public mock demo, and a minimal desktop shell. No payments, model calls, agent execution, or local file access yet.

## Repository layout

```
apps/
  web/        Next.js website: landing, /demo (public mock), /sign-in, /workspace, /account; proxies /api/* to the API
  api/        Backend (Hono on Node): OAuth, sessions, workspace-scoped reads, audit events
  desktop/    Tauri v2 Windows app: Vite + React UI in src/, Rust in src-tauri/
packages/
  contracts/  Shared Zod schemas: workflow DSL, step registry, run status, API shapes
  db/         Drizzle schema + SQL migrations; Postgres or embedded PGlite
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

**No `.env` is required.**
- The API uses embedded PGlite in `apps/api/.data/` and runs migrations on start.
- The public demo needs no account.
- Sign-in buttons show "not configured" until OAuth credentials are provided. There is no dev login bypass.

To enable sign-in, register OAuth apps ([docs/auth-setup.md](docs/auth-setup.md)) and copy `apps/api/.env.example` to `apps/api/.env`. Example files list variable **names only**. To use Postgres instead of PGlite, set `DATABASE_URL` (optional `docker-compose.yml` included).

### Run

| Command | What it does |
|---|---|
| `pnpm dev:web` | Website at http://localhost:3000 (demo at `/demo`) |
| `pnpm dev:api` | API at http://127.0.0.1:8787 (`GET /health`); the web app reaches it via `/api/*` |
| `pnpm dev` | Web + API together (needed for sign-in, workspace, and account pages) |
| `pnpm dev:desktop` | Desktop app in dev mode (Windows; also works on macOS/Linux with Tauri prerequisites) |
| `pnpm build:desktop` | Unsigned Windows installers (`target/release/bundle/{nsis,msi}`) |

### Check

| Command | What it does |
|---|---|
| `pnpm check` | Secret scan, Prettier check, ESLint, TypeScript, unit tests, production builds |
| `pnpm check:rust` | `cargo fmt --check`, `clippy -D warnings`, `cargo test` (needs the desktop frontend built once: `pnpm build`) |
| `pnpm lint` · `pnpm typecheck` · `pnpm test` · `pnpm build` | Individual steps (Turborepo) |
| `pnpm format` | Apply Prettier |
| `pnpm --filter @agentflow/web test:e2e` | Playwright E2E against production builds (run `pnpm build` first). Public suite uses PGlite; set `E2E_DATABASE_URL` to a Postgres database to also run the signed-in suite |
| `pnpm check:secrets` | Fail on committed `.env` files, values in `.env.example`, secret-looking `NEXT_PUBLIC_`/`VITE_` names, and common key patterns |

CI (`.github/workflows/ci.yml`) runs the JS checks, the Rust checks on Linux, Playwright E2E against a Postgres 16 service, and a Windows installer build with a launch smoke test.

## Safety rules for contributors

See [`CLAUDE.md`](CLAUDE.md) and [docs/threat-model.md](docs/threat-model.md). In short: no secrets in the repo; no shell/process, email-send, git-write, or unscoped file capabilities; every write needs approval bound to a content hash.

## License

MIT — see [LICENSE](LICENSE).
