// Level 2: what goes with reaching goal 1 — GROUP level only, never a score per person (§12).
import { addMonths, ageAt, type Day } from './dates';
import { includesAny, type Ctx } from './context';
import { day, str, type Person } from './model';

export interface Features {
  gender?: 'w' | 'm';
  latin?: boolean;
  school?: number;
  workYears?: number;
  ageEntry?: number;
  nationality?: string;
  hoursFirstYear?: number; // max weekly German-course hours in the first 12 months after entry
  courseWithin6m?: boolean;
}

/** Facts per person used only for group statistics. */
export function features(p: Person, ctx: Ctx): Features {
  const k = p.klientRow;
  const g = str(k.geschlecht).toLowerCase();
  const lat = str(k.lateinisch).toLowerCase();
  const f: Features = {
    gender: g.startsWith('w') || g.startsWith('f') ? 'w' : g.startsWith('m') ? 'm' : undefined,
    latin: lat ? lat.startsWith('ja') || lat.startsWith('yes') : undefined,
    school: typeof k.schuljahre === 'number' ? k.schuljahre : undefined,
    workYears: typeof k.arbeitserfahrung === 'number' ? k.arbeitserfahrung : undefined,
    nationality: str(k.nationalitaet) || undefined,
  };
  if (p.entry !== undefined) {
    if (p.birth !== undefined) f.ageEntry = ageAt(p.birth, p.entry);
    const kw = ctx.rules.goal1.language_course_keywords;
    const courses = ctx.rowsFor('foerderung', p).filter((r) => day(r.start) !== undefined && (includesAny(r.art, kw) || includesAny(r.bezeichnung, kw) || includesAny(r.art, ['Alphabetisierung'])));
    const end12 = addMonths(p.entry, 12);
    const first = courses.filter((r) => day(r.start)! <= end12);
    f.hoursFirstYear = first.length ? Math.max(...first.map((r) => (typeof r.stunden === 'number' ? r.stunden : 0))) : 0;
    const zb = p.zBeginn ?? p.entry;
    f.courseWithin6m = courses.some((r) => day(r.start)! <= addMonths(Math.max(zb, p.entry!), 6));
  }
  return f;
}

/** Wilson score interval (95 %). */
export function wilson(k: number, n: number, z = 1.959964): [number, number] {
  if (!n) return [0, 0];
  const ph = k / n;
  const den = 1 + (z * z) / n;
  const c = (ph + (z * z) / (2 * n)) / den;
  const h = (z * Math.sqrt((ph * (1 - ph)) / n + (z * z) / (4 * n * n))) / den;
  return [Math.max(0, c - h), Math.min(1, c + h)];
}

export type FactorKind = 'actionable' | 'background' | 'equity';
export type FactorSource = 'table' | 'ai' | 'equity';

export interface GroupStat {
  label: string; // i18n key suffix or raw label
  n: number;
  reached: number;
  rate: number;
  ci: [number, number];
}

export interface FactorResult {
  id: string;
  kind: FactorKind;
  source: FactorSource;
  groups: GroupStat[]; // empty when hidden
  hidden: boolean; // a group under min size (and it could be derived) -> whole factor hidden
  hiddenGroups: number;
  leftOut: number; // people without a value (not stated / not confirmed)
  gap: number | null; // percentage points between best and worst visible group
}

export interface PatternsResult {
  cohortSize: number;
  reached: number;
  rate: number;
  cohortCutoff: Day; // deadline before this date (Stichtag)
  factors: FactorResult[];
  minGroup: number;
}

type Pick = (p: Person, f: Features) => string | undefined;

interface FactorDef {
  id: string;
  kind: FactorKind;
  source: FactorSource;
  pick: Pick;
  order?: string[];
}

const band = (v: number | undefined, cuts: [number, string][]): string | undefined => {
  if (v === undefined) return undefined;
  let out: string | undefined;
  for (const [min, label] of cuts) if (v >= min) out = label;
  return out;
};

/**
 * Cohort: in-scope current clients whose goal-1 deadline is before the Stichtag (complete observation window).
 * Success = goal 1 reached on time. `confirmed` = Situationsanalyse fields confirmed by a social worker (zemis -> field -> value).
 */
export function computePatterns(persons: Person[], feats: Map<string, Features>, st: Day, minGroup: number, confirmed: Record<string, Record<string, unknown>> = {}): PatternsResult {
  const cohort = persons.filter((p) => {
    const r = p.goals[1];
    return r && r.deadline !== undefined && r.deadline < st && (r.status === 'reached' || r.status === 'missed');
  });
  const ok = (p: Person) => p.goals[1]!.status === 'reached' && !p.goals[1]!.late;
  const sa = (field: string, yes: unknown): Pick => (p) => {
    const v = confirmed[p.zemis]?.[field];
    if (v === undefined || v === null) return undefined;
    return v === yes ? 'yes' : 'no';
  };
  const defs: FactorDef[] = [
    { id: 'latin', kind: 'actionable', source: 'table', pick: (_, f) => (f.latin === undefined ? undefined : f.latin ? 'yes' : 'no'), order: ['yes', 'no'] },
    { id: 'hours', kind: 'actionable', source: 'table', pick: (_, f) => (f.hoursFirstYear === undefined ? undefined : f.hoursFirstYear >= 10 ? 'ge10' : 'lt10'), order: ['ge10', 'lt10'] },
    { id: 'course6m', kind: 'actionable', source: 'table', pick: (_, f) => (f.courseWithin6m === undefined ? undefined : f.courseWithin6m ? 'yes' : 'no'), order: ['yes', 'no'] },
    { id: 'childcare', kind: 'actionable', source: 'ai', pick: sa('childcare_duty_without_care', 'yes'), order: ['yes', 'no'] },
    { id: 'health', kind: 'actionable', source: 'ai', pick: (p) => { const v = confirmed[p.zemis]?.health_limits_work; return v === undefined || v === null ? undefined : v === 'none' ? 'no' : 'yes'; }, order: ['yes', 'no'] },
    { id: 'school', kind: 'background', source: 'table', pick: (_, f) => band(f.school, [[0, '0-5'], [6, '6-8'], [9, '9+']]), order: ['0-5', '6-8', '9+'] },
    { id: 'work', kind: 'background', source: 'table', pick: (_, f) => band(f.workYears, [[0, '0'], [1, '1-4'], [5, '5+']]), order: ['0', '1-4', '5+'] },
    { id: 'age', kind: 'background', source: 'table', pick: (_, f) => band(f.ageEntry, [[16, '16-25'], [26, '26-40'], [41, '41+']]), order: ['16-25', '26-40', '41+'] },
    { id: 'gender', kind: 'equity', source: 'equity', pick: (_, f) => f.gender, order: ['w', 'm'] },
    { id: 'nationality', kind: 'background', source: 'table', pick: (_, f) => f.nationality },
  ];
  const factors: FactorResult[] = defs.map((d) => {
    const groups = new Map<string, { n: number; k: number }>();
    let leftOut = 0;
    for (const p of cohort) {
      const v = d.pick(p, feats.get(p.id) ?? {});
      if (v === undefined) {
        leftOut++;
        continue;
      }
      const gstat = groups.get(v) ?? { n: 0, k: 0 };
      gstat.n++;
      if (ok(p)) gstat.k++;
      groups.set(v, gstat);
    }
    let list = [...groups.entries()].map(([label, s]) => ({ label, n: s.n, reached: s.k, rate: s.n ? s.k / s.n : 0, ci: wilson(s.k, s.n) }));
    if (d.order) list.sort((a, b) => d.order!.indexOf(a.label) - d.order!.indexOf(b.label));
    else list.sort((a, b) => b.n - a.n);
    const small = list.filter((g) => g.n < minGroup);
    // A single hidden group could be derived from the total and the others -> hide the whole factor.
    const hideAll = list.length < 2 || small.length === 1 || list.length - small.length < 2;
    const visible = hideAll ? [] : list.filter((g) => g.n >= minGroup);
    const rates = visible.map((g) => g.rate);
    return {
      id: d.id,
      kind: d.kind,
      source: d.source,
      groups: visible,
      hidden: hideAll,
      hiddenGroups: small.length,
      leftOut,
      gap: rates.length >= 2 ? Math.round((Math.max(...rates) - Math.min(...rates)) * 100) : null,
    };
  });
  const reached = cohort.filter(ok).length;
  // Order: actionable factors first (by gap), then equity, then background; nationality always last.
  const rank = (f: FactorResult) => (f.id === 'nationality' ? 3 : f.kind === 'actionable' ? 0 : f.kind === 'equity' ? 1 : 2);
  factors.sort((a, b) => rank(a) - rank(b) || (b.gap ?? -1) - (a.gap ?? -1));
  return { cohortSize: cohort.length, reached, rate: cohort.length ? reached / cohort.length : 0, cohortCutoff: st, factors, minGroup };
}
