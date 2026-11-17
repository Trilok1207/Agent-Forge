const inspect = Symbol.for("nodejs.util.inspect.custom");

/** Wraps a secret so it cannot leak through logging, JSON, or string coercion (B7). */
export class Secret {
  readonly #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  reveal(): string {
    return this.#value;
  }
  toString() {
    return "[redacted]";
  }
  toJSON() {
    return "[redacted]";
  }
  [inspect]() {
    return "Secret([redacted])";
  }
}

/** Generic credential shapes, redacted even when we don't know the exact value. */
const KEY_PATTERNS: readonly [RegExp, string][] = [
  [/\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}/g, "[redacted]"],
  [/\bAIza[0-9A-Za-z_-]{20,}/g, "[redacted]"],
  [/\b(?:gh[pousr]_|xox[abpr]-)[A-Za-z0-9-]{16,}/g, "[redacted]"],
  [/\b(Bearer)\s+[A-Za-z0-9._~+/=-]{12,}/gi, "$1 [redacted]"],
  [/\b(api[_-]?key|x-api-key)(["'\s:=]+)[^\s"',;}]{8,}/gi, "$1$2[redacted]"],
];

/**
 * Removes every known secret value and anything shaped like a credential.
 * Applied to all provider error text before it is logged, stored, or returned.
 */
export function redact(text: string, secrets: readonly (Secret | null | undefined)[] = []): string {
  let out = text;
  for (const s of secrets) {
    const v = s?.reveal();
    if (v && v.length >= 4) out = out.split(v).join("[redacted]");
  }
  for (const [re, replacement] of KEY_PATTERNS) out = out.replace(re, replacement);
  return out;
}
