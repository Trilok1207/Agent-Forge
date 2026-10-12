/**
 * Minimal structured logger. Callers pass identifiers and counts only, never
 * project content (names, descriptions, notes) or credentials.
 */
type Fields = Record<string, string | number | boolean | null | undefined>;

function emit(level: 'info' | 'warn' | 'error', event: string, fields: Fields = {}) {
  const entry = { ts: new Date().toISOString(), level, event, ...fields };
  // eslint-disable-next-line no-console
  console[level === 'info' ? 'log' : level](JSON.stringify(entry));
}

export const log = {
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
};
