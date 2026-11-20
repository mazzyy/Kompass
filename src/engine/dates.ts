// Dates are whole days since 1970-01-01 (UTC). No time zones, no system clock.
export type Day = number;

const MS = 86400000;

export function ymd(y: number, m: number, d: number): Day {
  return Math.round(Date.UTC(y, m - 1, d) / MS);
}

export function parts(day: Day): { y: number; m: number; d: number } {
  const dt = new Date(day * MS);
  return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Calendar month arithmetic; clamps to month end (31.01 + 1 month = 28/29.02). */
export function addMonths(day: Day, n: number): Day {
  const { y, m, d } = parts(day);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return ymd(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function addYears(day: Day, n: number): Day {
  return addMonths(day, n * 12);
}

export function addDays(day: Day, n: number): Day {
  return day + n;
}

/** dd.mm.yyyy */
export function fmt(day: Day | undefined | null): string {
  if (day === undefined || day === null) return '';
  const { y, m, d } = parts(day);
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}.${y}`;
}

export function iso(day: Day): string {
  const { y, m, d } = parts(day);
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function toJsDate(day: Day): Date {
  return new Date(day * MS);
}

/** Excel serial (1900 system) -> Day. Serial 25569 = 1970-01-01. */
export function fromExcelSerial(serial: number): Day {
  return Math.floor(serial) - 25569;
}

/**
 * Accepts: JS Date, Excel serial number, 'dd.mm.yyyy', 'd.m.yyyy', 'dd.mm.yy' (-> 20yy),
 * ISO 'yyyy-mm-dd'. Returns undefined for empty / unparseable input.
 */
export function parseDate(v: unknown): Day | undefined {
  if (v === null || v === undefined) return undefined;
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return undefined;
    // SheetJS cellDates gives local-midnight dates; use local components to avoid TZ shifts.
    const h = v.getHours();
    // Dates produced at UTC midnight read back in a positive-offset TZ show hour > 0; prefer UTC then.
    if (h === 0 && v.getMinutes() === 0) return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
    return ymd(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  }
  if (typeof v === 'number') {
    if (!isFinite(v) || v <= 0) return undefined;
    return fromExcelSerial(v);
  }
  const s = String(v).replace(/ /g, ' ').trim().replace(/^'/, '');
  if (!s) return undefined;
  let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2}|\d{4})(?:\s.*)?$/);
  if (m) {
    let y = Number(m[3]);
    if (m[3].length === 2) y += 2000;
    const mo = Number(m[2]);
    const d = Number(m[1]);
    if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return undefined;
    return ymd(y, mo, d);
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return ymd(Number(m[1]), Number(m[2]), Number(m[3]));
  if (/^\d+(\.\d+)?$/.test(s)) return fromExcelSerial(Number(s));
  return undefined;
}

/** Parse 'dd.mm.yyyy' strictly (for tests and config). */
export function d(s: string): Day {
  const r = parseDate(s);
  if (r === undefined) throw new Error(`bad date ${s}`);
  return r;
}

export function daysBetween(a: Day, b: Day): number {
  return b - a;
}

/** Whole years from birth to ref (birthday on ref counts). */
export function reachedAge(birth: Day, years: number, ref: Day): boolean {
  return addYears(birth, years) <= ref;
}

export function ageAt(birth: Day, ref: Day): number {
  const b = parts(birth);
  const r = parts(ref);
  let a = r.y - b.y;
  if (r.m < b.m || (r.m === b.m && r.d < b.d)) a--;
  return a;
}

/** Months between two days, floored (for "inactive 9 months"). */
export function monthsBetween(a: Day, b: Day): number {
  let n = 0;
  while (addMonths(a, n + 1) <= b) n++;
  return n;
}

export const year = (day: Day) => parts(day).y;
