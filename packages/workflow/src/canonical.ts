import { createHash } from "node:crypto";

/**
 * Deterministic JSON: object keys sorted, `undefined` dropped. Used for
 * content hashes (approvals, specs, audit chain) so equal values hash equally.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object" && !(value instanceof Date)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, v]) => [k, sortKeys(v)]),
    );
  }
  return value;
}

export const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

export const hashValue = (value: unknown) => sha256Hex(canonicalJson(value));
