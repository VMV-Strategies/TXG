import type { ScenarioResult } from '../engines/scenarios/compute';

export type DisplayCurrency = 'CAD' | 'USD';

/** Convert a CAD amount to the display currency using the year's FX (or the average). */
export function toDisplay(cad: number, cur: DisplayCurrency, r: Pick<ScenarioResult, 'fx' | 'years'>, year?: number | 'all'): number {
  if (cur === 'CAD') return cad;
  const rate = typeof year === 'number' && r.fx[year] ? r.fx[year] : r.years.reduce((a, y) => a + r.fx[y], 0) / Math.max(1, r.years.length);
  return cad / rate;
}

export function money(n: number | null | undefined, cur: DisplayCurrency = 'CAD', opts: { compact?: boolean; sign?: boolean } = {}): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  const sym = cur === 'USD' ? 'US$' : 'C$';
  const abs = Math.abs(n);
  let body: string;
  if (opts.compact && abs >= 1_000_000) body = `${(abs / 1_000_000).toFixed(abs >= 10_000_000 ? 1 : 2)}M`;
  else if (opts.compact && abs >= 10_000) body = `${Math.round(abs / 1000)}k`;
  else body = Math.round(abs).toLocaleString('en-CA');
  const sign = n < 0 ? '−' : opts.sign && n > 0 ? '+' : '';
  return `${sign}${sym}${body}`;
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function multiple(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return `${n.toFixed(2)}×`;
}

export function dateTime(iso: string | null): string {
  if (!iso) return 'never';
  const d = new Date(iso);
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function relTime(iso: string | null): string {
  if (!iso) return 'not yet saved';
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  return dateTime(iso);
}

export const cls = (...xs: (string | false | null | undefined)[]) => xs.filter(Boolean).join(' ');
