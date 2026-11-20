import { fmt, type Day } from './dates';
import type { Rec } from './import/detect';
import { TABLE_BY_ID, type TableId } from './import/signatures';

export type Status = 'reached' | 'on_track' | 'at_risk' | 'missed' | 'not_applicable' | 'no_data';
export type GoalId = 1 | 2 | 3;

/** A message rendered by the i18n layer (DE/EN). Params are already formatted (dates dd.mm.yyyy). */
export interface Msg {
  key: string;
  p?: Record<string, string | number>;
}

export interface SourceRef {
  table: TableId;
  row: number;
  fields: Record<string, string>; // German header -> value
}

export interface TraceStep {
  rule: string; // e.g. 'g1.deadline'
  msg: Msg;
  sources: SourceRef[];
}

export interface GoalResult {
  goal: GoalId;
  status: Status;
  reason: Msg;
  deadline?: Day;
  latestAction?: Day; // the last day something must happen (deadline / latest start / last support day)
  reachedDate?: Day;
  late?: boolean;
  source?: 'proven' | 'computed';
  via?: string; // 'zielerreichung' | 'sprachstand' | 'muttersprache' | ...
  proofIssue?: boolean; // goal 1: level >= A1 but proof type not accepted (fixable)
  trace: TraceStep[];
}

export interface Person {
  id: string; // Klientennummer (else Zemis)
  zemis: string;
  klientNr: string;
  dossierNr: string;
  displayName: string;
  socialWorker: string;
  status: string; // current status at Stichtag
  statusKlient?: string;
  birth?: Day;
  entry?: Day;
  entryYear?: number;
  zBeginn?: Day;
  zEnde?: Day;
  current: boolean;
  goals: Partial<Record<GoalId, GoalResult>>;
  lastActivity?: Day;
  kohorte?: number;
  klientRow: Rec;
}

export type Severity = 'high' | 'medium' | 'info';
export type AlertCode =
  | 'zemis_job_not_in_erwerb'
  | 'a1_without_accepted_proof'
  | 'reached_not_recorded'
  | 'proven_not_reproduced'
  | 'missing_entry_event'
  | 'status_mismatch'
  | 'missing_case_manager'
  | 'invalid_period'
  | 'household_without_head'
  | 'overlapping_jobs_merged'
  | 'born_in_ch'
  | 'unknown_value'
  | 'bad_date';

export const ALERT_META: Record<AlertCode, { severity: Severity; affects: string }> = {
  zemis_job_not_in_erwerb: { severity: 'high', affects: 'goal2' },
  a1_without_accepted_proof: { severity: 'high', affects: 'goal1' },
  reached_not_recorded: { severity: 'high', affects: 'payment' },
  proven_not_reproduced: { severity: 'info', affects: 'payment' },
  missing_entry_event: { severity: 'medium', affects: 'goal1' },
  status_mismatch: { severity: 'medium', affects: 'scope' },
  missing_case_manager: { severity: 'medium', affects: 'calls' },
  invalid_period: { severity: 'medium', affects: 'all' },
  household_without_head: { severity: 'medium', affects: 'goal3' },
  overlapping_jobs_merged: { severity: 'info', affects: 'goal2' },
  born_in_ch: { severity: 'info', affects: 'goal1' },
  unknown_value: { severity: 'medium', affects: 'import' },
  bad_date: { severity: 'medium', affects: 'import' },
};

export interface Alert {
  code: AlertCode;
  severity: Severity;
  personId?: string;
  goal?: GoalId;
  msg: Msg;
  sources: SourceRef[];
}

export interface CallItem {
  personId: string;
  category: 1 | 2 | 3 | 4 | 5; // 1 at risk, 2 missed but fixable, 3 inactive, 4 transition, 5 other on track soon
  goal?: GoalId;
  keyDate?: Day;
  daysLeft?: number;
  sortKey: number; // ranking within the category (never money)
  lead: Msg;
  reasons: Msg[];
  talkingPoints: Msg[];
}

export type Bucket = 'reached_on_time' | 'reached_late' | 'on_track' | 'at_risk' | 'missed' | 'no_data' | 'not_applicable';
export const BUCKETS: Bucket[] = ['reached_on_time', 'reached_late', 'on_track', 'at_risk', 'missed', 'no_data', 'not_applicable'];

export interface TotalsRow {
  group: string;
  counts: Record<Bucket, number>;
  counted: number; // reached + on_track + at_risk + missed
  reached: number;
  rate: number | null; // reached / counted
  total: number;
}

export interface GoalTotals {
  goal: GoalId;
  unit: 'persons' | 'households';
  overall: TotalsRow;
  bySocialWorker: TotalsRow[];
  byEntryYear: TotalsRow[];
  byCohort: TotalsRow[];
}

export interface Household {
  dossierNr: string;
  members: string[]; // person ids active on Stichtag
  head?: string;
  socialWorker: string;
  goal3?: GoalResult;
}

export interface RunResult {
  stichtag: Day;
  rulesVersion: string;
  computedGoals: GoalId[];
  missingTables: TableId[];
  notes: Msg[];
  persons: Person[]; // current clients only
  households: Household[];
  totals: Partial<Record<GoalId, GoalTotals>>;
  callLists: Record<string, CallItem[]>;
  socialWorkers: string[];
  alerts: Alert[];
  inputs: { fileName: string; table?: TableId; rows: number }[];
}

// ---------- helpers ----------

export function srcRef(rec: Rec, keys?: string[]): SourceRef {
  const spec = TABLE_BY_ID[rec._table];
  const fields: Record<string, string> = {};
  for (const col of spec.columns) {
    if (keys && !keys.includes(col.key)) continue;
    const v = rec[col.key];
    if (v === undefined || v === null || v === '') continue;
    fields[col.header] = col.type === 'date' ? fmt(v as Day) : String(v);
  }
  return { table: rec._table, row: rec._row, fields };
}

export const str = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
export const day = (v: unknown): Day | undefined => (typeof v === 'number' ? v : undefined);
