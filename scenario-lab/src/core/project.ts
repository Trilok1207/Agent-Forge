import { z } from 'zod';

export const PROJECT_SCHEMA_VERSION = 1 as const;

const isoDate = z.string().datetime({ offset: true });

/**
 * A scenario is a named set of overrides applied on top of the project's
 * baseline model. The baseline itself is never modified by a scenario.
 * Override keys are domain-defined parameter paths.
 */
export const ScenarioSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1).max(80),
  description: z.string().max(2000).default(''),
  overrides: z.record(z.string(), z.unknown()).default({}),
  /** Baseline model revision the scenario was created against. */
  baseRevision: z.number().int().min(1),
  createdAt: isoDate,
  updatedAt: isoDate,
});
export type Scenario = z.infer<typeof ScenarioSchema>;

/**
 * Stored simulation runs. The detailed shape is owned by the simulation
 * layer; the envelope only requires the fields the dashboard needs.
 */
export const RunEnvelopeSchema = z
  .object({
    id: z.string().min(1),
    status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled']),
    startedAt: isoDate,
  })
  .passthrough();
export type RunEnvelope = z.infer<typeof RunEnvelopeSchema>;

/**
 * Versioned, serializable project envelope. `model` is validated by the
 * project's domain (see `DomainDefinition.modelSchema`).
 */
export const ProjectSchema = z.object({
  schemaVersion: z.literal(PROJECT_SCHEMA_VERSION),
  id: z.string().min(1).max(64),
  name: z.string().trim().min(1, 'Project name is required.').max(80),
  description: z.string().max(2000).default(''),
  domainId: z.string().min(1),
  isSample: z.boolean().default(false),
  createdAt: isoDate,
  updatedAt: isoDate,
  /** Incremented whenever the baseline model changes. */
  modelRevision: z.number().int().min(1),
  model: z.unknown(),
  scenarios: z.array(ScenarioSchema).default([]),
  runs: z.array(RunEnvelopeSchema).default([]),
});
export type Project = z.infer<typeof ProjectSchema>;

export type ProjectSummary = Pick<Project, 'id' | 'name' | 'domainId' | 'updatedAt' | 'isSample'> & {
  latestRunStatus: RunEnvelope['status'] | 'never_run';
  latestRunAt?: string;
  scenarioCount: number;
};

export function summarizeProject(p: Project): ProjectSummary {
  const latest = [...p.runs].sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  return {
    id: p.id,
    name: p.name,
    domainId: p.domainId,
    updatedAt: p.updatedAt,
    isSample: p.isSample,
    latestRunStatus: latest?.status ?? 'never_run',
    latestRunAt: latest?.startedAt,
    scenarioCount: p.scenarios.length,
  };
}
