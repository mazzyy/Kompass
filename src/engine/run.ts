import { buildCallLists, lastActivity } from './calls';
import { Ctx } from './context';
import { fmt, parseDate, type Day } from './dates';
import { computeGoal1, provenRows } from './goal1';
import { computeGoal2, zemisCheck } from './goal2';
import { buildHouseholds, computeGoal3 } from './goal3';
import type { FileAnalysis, ParsedTables } from './import/detect';
import { TABLES, TABLE_BY_ID, type TableId } from './import/signatures';
import { day, srcRef, type Alert, type GoalId, type Msg, type Person, type RunResult } from './model';
import { features as personFeatures } from './patterns';
import { buildPerson, isCurrent } from './population';
import type { Rules } from './rules';
import { personUnits, totalsFor } from './totals';

/** Stichtag: explicit override, else rules.stichtag if a date, else the latest export date, else fallback. */
export function resolveStichtag(rules: Rules, analyses: FileAnalysis[], override?: Day, fallback?: Day): Day | undefined {
  if (override !== undefined) return override;
  const fromRules = parseDate(rules.stichtag);
  if (fromRules !== undefined) return fromRules;
  const mods = analyses.map((a) => a.modified).filter((m): m is Day => m !== undefined);
  if (mods.length) return Math.max(...mods);
  return fallback;
}

const PERIOD_COLS: Partial<Record<TableId, [string, string]>> = {
  asylverfahrensstand: ['von', 'bis'],
  dossierperson: ['von', 'bis'],
  finanz: ['von', 'bis'],
  unterbringung: ['von', 'bis'],
  foerderung: ['start', 'abschluss'],
  erwerb: ['von', 'bis'],
  zemis: ['von', 'bis'],
};

export interface RunInput {
  parsed: ParsedTables;
  rules: Rules;
  stichtag: Day;
  inputs?: { fileName: string; table?: TableId; rows: number }[];
}

export function run({ parsed, rules, stichtag, inputs = [] }: RunInput): RunResult {
  const ctx = new Ctx(parsed, rules, stichtag);
  const alerts: Alert[] = [];
  const notes: Msg[] = [];
  const missingTables = TABLES.filter((t) => !ctx.has(t.id)).map((t) => t.id);
  const computed: GoalId[] = [];

  // Import-level data quality
  for (const u of parsed.unknownValues) {
    alerts.push({
      code: 'unknown_value',
      severity: 'medium',
      msg: { key: 'dq.unknown_value', p: { table: TABLE_BY_ID[u.table].name, column: u.column, value: u.value, n: u.rows.length } },
      sources: u.rows.slice(0, 20).map((row) => ({ table: u.table, row, fields: { [u.column]: u.value } })),
    });
  }
  for (const b of parsed.badDates) {
    alerts.push({
      code: 'bad_date',
      severity: 'medium',
      msg: { key: 'dq.bad_date', p: { table: TABLE_BY_ID[b.table].name, column: b.column, value: b.value } },
      sources: [{ table: b.table, row: b.row, fields: { [b.column]: b.value } }],
    });
  }
  for (const [t, [a, b]] of Object.entries(PERIOD_COLS) as [TableId, [string, string]][]) {
    for (const r of ctx.tables[t] ?? []) {
      const von = day(r[a]);
      const bis = day(r[b]);
      if (von !== undefined && bis !== undefined && bis < von)
        alerts.push({
          code: 'invalid_period',
          severity: 'medium',
          personId: (r.klientNr as string) || (r.zemis as string) || undefined,
          msg: { key: 'dq.invalid_period', p: { table: TABLE_BY_ID[t].name, von: fmt(von), bis: fmt(bis) } },
          sources: [srcRef(r)],
        });
    }
  }

  if (!ctx.has('klient')) {
    notes.push({ key: 'note.no_klient' });
    return {
      stichtag,
      rulesVersion: rules.version,
      computedGoals: [],
      missingTables,
      notes,
      persons: [],
      households: [],
      totals: {},
      callLists: {},
      socialWorkers: [],
      alerts,
      claimable: [],
      features: {},
      inputs,
    };
  }

  // Population
  const persons: Person[] = [];
  for (const k of ctx.tables.klient!) {
    if (!isCurrent(k, ctx)) continue;
    persons.push(buildPerson(k, ctx, alerts));
  }
  persons.sort((a, b) => a.id.localeCompare(b.id));

  // Goal 1
  const canGoal1 = ctx.has('asylgeschaeftsdaten') && ctx.has('sprachstand');
  if (canGoal1) {
    computed.push(1);
    for (const p of persons) p.goals[1] = computeGoal1(p, ctx, alerts);
  } else {
    if (!ctx.has('sprachstand')) notes.push({ key: 'note.no_goal1_sprachstand' });
    if (!ctx.has('asylgeschaeftsdaten')) notes.push({ key: 'note.no_goal1_events' });
  }

  // Goal 2
  if (ctx.has('erwerb')) {
    computed.push(2);
    for (const p of persons) p.goals[2] = computeGoal2(p, ctx, alerts);
    if (ctx.has('zemis')) for (const p of persons) zemisCheck(p, ctx, alerts);
  } else notes.push({ key: 'note.no_goal2' });

  // Goal 3 (per household)
  const households = buildHouseholds(persons, ctx, alerts);
  const byId = new Map(persons.map((p) => [p.id, p]));
  for (const h of households) byId.get(h.head!)!.isHead = true;
  if (ctx.has('finanz')) {
    computed.push(3);
    for (const h of households) {
      h.goal3 = computeGoal3(h, byId, ctx, alerts);
      for (const m of h.members) byId.get(m)!.goals[3] = h.goal3;
    }
  } else notes.push({ key: 'note.no_goal3' });

  for (const p of persons) {
    p.lastActivity = lastActivity(p, ctx);
    const cohortRow = [...provenRows(p, ctx, 1), ...provenRows(p, ctx, 2), ...provenRows(p, ctx, 3)].find(
      (r) => typeof r.kohorte === 'number',
    );
    p.kohorte = cohortRow?.kohorte as number | undefined;
  }

  const totals: RunResult['totals'] = {};
  if (computed.includes(1)) totals[1] = totalsFor(1, personUnits(persons, 1), 'persons');
  if (computed.includes(2)) totals[2] = totalsFor(2, personUnits(persons, 2), 'persons');
  if (computed.includes(3))
    totals[3] = totalsFor(
      3,
      households.map((h) => ({ result: h.goal3, socialWorker: h.socialWorker, entryYear: byId.get(h.head!)!.entryYear })),
      'households',
    );
  const noEntry = persons.filter((p) => p.goals[1]?.status === 'no_data').length;
  if (noEntry) notes.push({ key: 'note.no_entry', p: { n: noEntry } });

  const callLists = buildCallLists(persons, ctx, computed);
  const byPid = new Map(persons.map((p) => [p.id, p]));
  const claimable: RunResult['claimable'] = alerts
    .filter((a) => a.code === 'reached_not_recorded' && a.personId && a.goal)
    .map((a) => {
      const r = byPid.get(a.personId!)!.goals[a.goal!]!;
      return { personId: a.personId!, goal: a.goal!, reachedDate: r.reachedDate!, reason: r.reason, sources: a.sources };
    })
    .sort((a, b) => a.goal - b.goal || a.reachedDate - b.reachedDate);
  const socialWorkers = [...new Set(persons.map((p) => p.socialWorker))].sort();

  return {
    stichtag,
    rulesVersion: rules.version,
    computedGoals: computed,
    missingTables,
    notes,
    persons,
    households,
    totals,
    callLists,
    socialWorkers,
    alerts,
    claimable,
    features: Object.fromEntries(persons.map((p) => [p.id, personFeatures(p, ctx)])),
    inputs,
  };
}
