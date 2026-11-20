import { BUCKETS, type Bucket, type GoalId, type GoalResult, type GoalTotals, type Person, type TotalsRow } from './model';

export function bucketOf(r: GoalResult | undefined): Bucket {
  if (!r) return 'not_applicable';
  if (r.status === 'reached') return r.late ? 'reached_late' : 'reached_on_time';
  return r.status;
}

function emptyRow(group: string): TotalsRow {
  return {
    group,
    counts: Object.fromEntries(BUCKETS.map((b) => [b, 0])) as Record<Bucket, number>,
    counted: 0,
    reached: 0,
    rate: null,
    total: 0,
  };
}

function finish(r: TotalsRow): TotalsRow {
  const c = r.counts;
  r.reached = c.reached_on_time + c.reached_late;
  r.counted = r.reached + c.on_track + c.at_risk + c.missed;
  r.total = BUCKETS.reduce((s, b) => s + c[b], 0);
  r.rate = r.counted ? r.reached / r.counted : null;
  return r;
}

export interface Unit {
  result?: GoalResult;
  socialWorker: string;
  entryYear?: number;
  cohort?: number;
}

export function totalsFor(goal: GoalId, units: Unit[], unit: 'persons' | 'households'): GoalTotals {
  const overall = emptyRow('Total');
  const sw = new Map<string, TotalsRow>();
  const ey = new Map<string, TotalsRow>();
  const co = new Map<string, TotalsRow>();
  for (const u of units) {
    const b = bucketOf(u.result);
    overall.counts[b]++;
    const add = (m: Map<string, TotalsRow>, k: string) => {
      if (!m.has(k)) m.set(k, emptyRow(k));
      m.get(k)!.counts[b]++;
    };
    add(sw, u.socialWorker);
    add(ey, u.entryYear !== undefined ? String(u.entryYear) : '–');
    if (u.cohort !== undefined) add(co, String(u.cohort));
  }
  const sorted = (m: Map<string, TotalsRow>) => [...m.values()].map(finish).sort((a, b) => a.group.localeCompare(b.group));
  return {
    goal,
    unit,
    overall: finish(overall),
    bySocialWorker: sorted(sw),
    byEntryYear: sorted(ey),
    byCohort: sorted(co),
  };
}

export function personUnits(persons: Person[], goal: GoalId): Unit[] {
  return persons.map((p) => ({ result: p.goals[goal], socialWorker: p.socialWorker, entryYear: p.entryYear, cohort: p.kohorte }));
}
