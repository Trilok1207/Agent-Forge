# Scenario Lab

Scenario Lab (working title — set `VITE_APP_NAME`) is a browser app for exploring
operational decisions with simulation. You describe a system, change assumptions,
run "what if?" scenarios and compare the outcomes. The first release focuses on
**warehouse order fulfillment**.

> Simulated, not guaranteed. Results come from a simplified, deterministic model of
> the inputs you can inspect. They help compare options; they are not predictions.
> The app is for analysis and education and must not control real equipment.

## Quick start

```bash
cd scenario-lab
npm install
npm run dev        # http://localhost:5173
npm run build      # typecheck + production build into dist/
npm run typecheck  # TypeScript only
```

Optional: copy `.env.example` to `.env.local` to change the app name. No credentials
are needed; there are no external services.

## Stack and why

The repository was empty, so a mainstream, low-dependency stack was chosen:

| Concern | Choice | Reason |
| --- | --- | --- |
| UI | React 19 + TypeScript (strict) | Widely known, strong typing |
| Build | Vite 6 | Fast dev server, simple config |
| Routing | React Router 7 | Standard client routing |
| Validation | Zod 3 | One schema gives runtime validation *and* TS types at every boundary |
| Styling | Plain CSS with design tokens (`src/ui/styles.css`) | No framework lock-in; light/dark via `prefers-color-scheme` |
| Persistence | Browser `localStorage` behind a `ProjectRepository` interface | No backend needed for v1; swappable |

## Architecture

```
src/
  config/        App configuration (name, storage namespace)
  core/          Domain-agnostic: project envelope, provenance, validation types,
                 domain interface, factories, logging, formatting
  domains/
    registry.ts  List of available simulation domains
    warehouse/   Warehouse domain: model schema, sample + blank models,
                 walkway graph (shortest paths), semantic validation, summary
  persistence/   Repository interface, localStorage implementation,
                 versioned (de)serialization with migration hook
  state/         React contexts: projects (over the repository), notifications
  ui/            Layout, pages and components (no domain math in here)
```

Key design rules:

- **Domains plug in through `DomainDefinition`** (`src/core/domain.ts`): schema, model
  version, blank/sample models, validation, summary. The core (projects, persistence,
  and later scenarios/runs/exports) never imports warehouse code directly. Adding a
  domain means implementing that interface and registering it in `domains/registry.ts`.
- **Every parameter carries provenance** (`src/core/provenance.ts`): `user_fact`,
  `user_assumption`, `default`, `ai_suggestion` or `unknown`. The schema enforces that an
  unknown has no value and anything else has one, so an unknown is never silently
  treated as a fact.
- **Validation at every boundary**: data loaded from storage (and, later, imports) is
  parsed as JSON and validated against the project envelope schema, then against the
  domain model schema. It is never executed. Semantic checks (overlaps, unreachable
  locations, missing facilities, required unknowns) are separate from schema checks;
  errors block simulation, warnings do not.
- **Versioning**: projects carry `schemaVersion` (envelope) and the model carries
  `modelVersion` (`warehouse-1.0.0`). `modelRevision` increments on every baseline edit.
  `persistence/serialization.ts` has the migration hook for future versions.
- **Logging** (`core/log.ts`) records ids and counts only, never project content.

### Warehouse model (v1)

Units are fixed and shown in the UI: metres, m/s, seconds (tasks), hours (shifts),
orders/hour, currency per hour.

- **Layout**: rectangular building; storage zones (with a relative *pick share*);
  storage locations (racks/bays, each with an access point); packing stations (with
  packer capacity); inbound/outbound docks; and a walkway network of points and
  two-way straight segments. Travel distance = shortest path on the walkway network.
- **Operations**: shift length and maximum overtime; order arrival rate (steady or
  hourly profile); items per order (uniform integer range); pickers (people, robots,
  or both: count, speed, seconds per item); picking strategy (one order per trip or
  batches) and routing (nearest next pick or zone sequence); packing time per order and
  per item; hourly costs and overtime multiplier.
- **Goals**: success criteria on named metrics, free-text constraints, and recorded
  assumptions with their source.

The sample project (`domains/warehouse/sample.ts`) is a 56 m × 40 m building with five
aisles, 30 rack locations in three zones and two packing stations. Its values are
labelled as illustrative, not real data.

## Roadmap / status

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Inspect repo, plan | Done |
| 1 | Foundation: navigation, dashboard, project schema, sample project, persistence | Done |
| 2 | Guided setup, model editing, 2D layout editor with keyboard alternative | Planned |
| 3 | Deterministic discrete-event engine, seeded RNG, replications, metrics, provenance | Planned |
| 4 | Scenarios, run controls and history, results and comparison | Planned |
| 5 | Explainability views, report and data export, project import | Planned |
| 6 | AI assistance behind a provider abstraction (mock mode without a provider) | Planned |
| 7 | Polish: onboarding, accessibility, responsive, docs | Planned |

## Verification

The repository has no automated test suite. Each phase is verified with
`npm run build` (strict typecheck + bundle) and a manual walkthrough in the browser.
Phase 1 manual checks:

1. Open the app with no saved data → empty state with "Open the sample warehouse".
2. Open the sample → overview shows "complete enough to simulate", source labels on values.
3. Edit project details → saved and visible after reload.
4. Duplicate a project → copy appears; run history is not copied.
5. Start a new project with an empty name → inline error; with a name → blank project
   showing the unknown values that must be filled in.
6. Delete with confirmation → removed, also after reload.
7. Damaged stored data → dashboard lists it with a reason and a Remove button.
8. Unknown project URL and unknown page → "not found" states with a way back.

## Limitations (current build)

- Projects live in this browser's storage only; there is no account or sync.
- Model editing, simulation, scenarios, results and export are not implemented yet
  (see roadmap). The project page currently shows the model read-only.
