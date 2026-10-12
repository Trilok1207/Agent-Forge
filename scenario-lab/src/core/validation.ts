export type IssueSeverity = 'error' | 'warning';

/** A human-readable problem found in a model. `path` points at the field. */
export interface ValidationIssue {
  severity: IssueSeverity;
  path: string;
  message: string;
}

export const hasErrors = (issues: readonly ValidationIssue[]) => issues.some((i) => i.severity === 'error');

/** Turn zod issues into user-readable validation issues. */
export function fromZodIssues(issues: readonly { path: (string | number)[]; message: string }[]): ValidationIssue[] {
  return issues.map((i) => ({
    severity: 'error' as const,
    path: i.path.join('.') || '(root)',
    message: i.message,
  }));
}
