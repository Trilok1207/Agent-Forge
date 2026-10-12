import { z } from 'zod';

/**
 * Where a model value came from. The app never silently promotes one source
 * to another (e.g. an unknown value is never turned into a user fact).
 */
export const VALUE_SOURCES = [
  'user_fact',
  'user_assumption',
  'default',
  'ai_suggestion',
  'unknown',
] as const;

export type ValueSource = (typeof VALUE_SOURCES)[number];
export const ValueSourceSchema = z.enum(VALUE_SOURCES);

export const VALUE_SOURCE_INFO: Record<ValueSource, { label: string; description: string }> = {
  user_fact: {
    label: 'Your data',
    description: 'A value you entered as a known fact about your operation.',
  },
  user_assumption: {
    label: 'Your assumption',
    description: 'A value you chose as a working assumption. It may not match reality.',
  },
  default: {
    label: 'App default',
    description: 'A generic starting value supplied by the app. Review it before relying on results.',
  },
  ai_suggestion: {
    label: 'AI suggestion',
    description: 'Suggested by the assistant. Not measured; review before relying on it.',
  },
  unknown: {
    label: 'Unknown',
    description: 'No value yet. The model cannot be simulated until required unknowns are filled in.',
  },
};

/**
 * A model parameter that carries its own provenance. `value` is `null` when
 * and only when the source is `unknown`.
 */
export function paramSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z
    .object({
      value: valueSchema.nullable(),
      source: ValueSourceSchema,
      note: z.string().max(500).optional(),
    })
    .superRefine((p, ctx) => {
      if (p.source === 'unknown' && p.value !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'An unknown value must not have a value. Choose another source when entering one.',
        });
      }
      if (p.source !== 'unknown' && p.value === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'A value is required unless the source is "unknown".',
        });
      }
    });
}

export interface Param<T> {
  value: T | null;
  source: ValueSource;
  note?: string;
}

export const param = <T>(value: T, source: Exclude<ValueSource, 'unknown'>, note?: string): Param<T> =>
  note === undefined ? { value, source } : { value, source, note };

export const unknownParam = <T>(note?: string): Param<T> =>
  note === undefined ? { value: null, source: 'unknown' } : { value: null, source: 'unknown', note };
