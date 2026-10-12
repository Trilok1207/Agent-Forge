import type { z } from 'zod';
import type { ValidationIssue } from './validation';

export interface ModelSummaryItem {
  label: string;
  value: string;
  /** Provenance of the displayed value, when it maps to a single parameter. */
  source?: import('./provenance').ValueSource;
  help?: string;
}

export interface ModelSummarySection {
  title: string;
  items: ModelSummaryItem[];
}

/**
 * A simulation domain (e.g. warehouse operations). The core app — projects,
 * persistence, scenarios, runs, exports — only talks to domains through this
 * interface, so new domains can be added without changing the core.
 */
export interface DomainDefinition<M = unknown> {
  id: string;
  label: string;
  description: string;
  /** Version of the model schema/semantics. Recorded with every run. */
  modelVersion: string;
  modelSchema: z.ZodType<M, z.ZodTypeDef, unknown>;
  createBlankModel(): M;
  createSample(): { name: string; description: string; model: M };
  /** Semantic checks beyond the schema (references, geometry, unknowns). */
  validateModel(model: M): ValidationIssue[];
  summarize(model: M): ModelSummarySection[];
}
