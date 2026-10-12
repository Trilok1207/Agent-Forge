import { PROJECT_SCHEMA_VERSION, ProjectSchema, type Project } from '@/core/project';
import { fromZodIssues, type ValidationIssue } from '@/core/validation';
import { getDomain } from '@/domains/registry';

export type ParseResult = { ok: true; project: Project } | { ok: false; issues: ValidationIssue[] };

/**
 * Upgrade older serialized projects to the current schema version.
 * Version 1 is the first version; future versions add steps here.
 */
function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null) return raw;
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === PROJECT_SCHEMA_VERSION) return raw;
  return raw; // Unknown versions fall through to schema validation, which reports them.
}

/**
 * Validate untrusted project data (from storage or a user import). The
 * envelope is checked first, then the model against its domain's schema.
 * Data is only ever parsed as JSON — never executed.
 */
export function parseProject(raw: unknown): ParseResult {
  const envelope = ProjectSchema.safeParse(migrate(raw));
  if (!envelope.success) return { ok: false, issues: fromZodIssues(envelope.error.issues) };

  const domain = getDomain(envelope.data.domainId);
  if (!domain) {
    return {
      ok: false,
      issues: [{ severity: 'error', path: 'domainId', message: `Unsupported project type "${envelope.data.domainId}".` }],
    };
  }
  const model = domain.modelSchema.safeParse(envelope.data.model);
  if (!model.success) {
    return { ok: false, issues: fromZodIssues(model.error.issues.map((i) => ({ ...i, path: ['model', ...i.path] }))) };
  }
  return { ok: true, project: { ...envelope.data, model: model.data } };
}

export function serializeProject(project: Project): string {
  return JSON.stringify(project);
}
