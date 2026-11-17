/**
 * Dates calendaires « AAAA-MM-JJ », sans heure ni fuseau, calculées en UTC
 * (jour d'une bougie journalière Binance). Repris de dca-crypto (commit
 * 50ce806, src/lib/core/dates.ts), fonctions utiles ici seulement.
 */

export const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Date valide au format AAAA-MM-JJ ? */
export function isIsoDate(value: string): boolean {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/** AAAA-MM-JJ → instant UTC de minuit (ms). */
export function dateToUtcMs(date: string): number {
  if (!isIsoDate(date)) throw new RangeError(`Date invalide : ${date}`);
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** Instant UTC (ms) → AAAA-MM-JJ du jour UTC qui le contient. */
export function utcMsToDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return utcMsToDate(dateToUtcMs(date) + days * DAY_MS);
}

/** Nombre de jours de `from` à `to` (négatif si `to` est avant). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / DAY_MS);
}

/** Toutes les dates de `from` à `to` inclus. */
export function eachDay(from: string, to: string): string[] {
  const out: string[] = [];
  for (let ms = dateToUtcMs(from), end = dateToUtcMs(to); ms <= end; ms += DAY_MS) out.push(utcMsToDate(ms));
  return out;
}

/** Date UTC du jour. */
export function today(): string {
  return utcMsToDate(Date.now());
}

/** « 14 mars 2025 ». */
export function dateText(date: string): string {
  return new Date(dateToUtcMs(date)).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}
