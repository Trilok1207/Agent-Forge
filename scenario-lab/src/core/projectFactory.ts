import type { DomainDefinition } from './domain';
import { newId } from './ids';
import { PROJECT_SCHEMA_VERSION, type Project } from './project';

const now = () => new Date().toISOString();

function base(domain: DomainDefinition<unknown>, fields: { name: string; description: string; model: unknown; isSample: boolean }): Project {
  const t = now();
  return {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    id: newId('prj'),
    name: fields.name,
    description: fields.description,
    domainId: domain.id,
    isSample: fields.isSample,
    createdAt: t,
    updatedAt: t,
    modelRevision: 1,
    model: fields.model,
    scenarios: [],
    runs: [],
  };
}

export function createBlankProject(domain: DomainDefinition<unknown>, name: string, description: string): Project {
  return base(domain, { name, description, model: domain.createBlankModel(), isSample: false });
}

export function createSampleProject(domain: DomainDefinition<unknown>): Project {
  const sample = domain.createSample();
  return base(domain, { ...sample, isSample: true });
}

/**
 * Copy a project's model and scenarios under a new id. Runs are not copied:
 * they belong to the original project's history.
 */
export function duplicateProject(source: Project): Project {
  const t = now();
  return {
    ...structuredClone(source),
    id: newId('prj'),
    name: `Copy of ${source.name}`.slice(0, 80),
    isSample: false,
    createdAt: t,
    updatedAt: t,
    runs: [],
  };
}
