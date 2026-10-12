import type { Param } from './provenance';

export function formatNumber(n: number, maxFractionDigits = 2): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: maxFractionDigits });
}

/** Format a parameter value with its unit, or "Unknown" when not set. */
export function formatParam(p: Param<number>, unit = '', digits = 2): string {
  if (p.value === null) return 'Unknown';
  return unit ? `${formatNumber(p.value, digits)} ${unit}` : formatNumber(p.value, digits);
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
