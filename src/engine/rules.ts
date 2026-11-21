import { load as yamlLoad } from 'js-yaml';

export interface Rules {
  version: string;
  stichtag: string;
  at_risk_window_months: number;
  population: { require_open_responsibility: boolean; exclude_handed_over: boolean };
  scope: {
    statuses: string[];
    excluded_statuses: string[];
    min_age: number;
    age_reference: 'stichtag' | 'entry' | 'deadline';
  };
  goal1: {
    years_from_entry: number;
    entry_event: string;
    birth_event: string;
    languages_counting: string[];
    min_level: string;
    level_order: string[];
    accepted_proof: string[];
    mother_tongue_counts: boolean;
    count_late_as_reached: boolean;
    active_course_softens_risk: boolean;
    language_course_keywords: string[];
  };
  goal2: {
    min_pensum: number;
    months_uninterrupted: number;
    combine_jobs: boolean;
    max_gap_days: number;
    exclude_keywords: string[];
    education_types: string[];
    education_counts_from: 'start' | 'completion';
    count_self_employed: boolean;
  };
  goal3: {
    months_without_support: number;
    support_types: string[];
    deadline_from: 'head' | 'latest_member' | 'earliest_member';
  };
  goal_mapping: {
    goal1_keywords: string[];
    goal2_keywords: string[];
    goal3_keywords: string[];
    ignore_status_s_rows: boolean;
  };
  payment_period: { years_by_status: Record<string, number>; counted_from: Record<string, 'entry' | 'application'>; application_events: string[] };
  whatif_2027: { switch_date: string; new_years_from_entry: number; interpretation: 'A' | 'B' };
  payment: { lump_sum_chf: { goal1: number | null; goal2: number | null; goal3: number | null }; forecast_quarters: number };
  calls: { top_n: number; inactive_months: number; transition_months: number; rank_by_payout: boolean };
  patterns: { min_group_size: number; confidence: number; method: string };
  dq: { date_tolerance_days: number; employer_match_threshold: number; legal_forms_to_strip: string[] };
  ai: { provider: string; endpoint: string; model: string; temperature: number; use_cached_results_when_offline: boolean; embed_model?: string };
  voice?: { default: 'local' | 'elevenlabs'; elevenlabs_model: string; elevenlabs_voice_id: string };
  i18n: { default_language: 'de' | 'en' };
}

export function parseRules(text: string): Rules {
  const r = yamlLoad(text) as Rules;
  // Never allow ranking by payout (TC-02).
  r.calls.rank_by_payout = false;
  return r;
}

export function cloneRules(r: Rules): Rules {
  return JSON.parse(JSON.stringify(r));
}

/** Flatten for the Rules panel / Regeln sheet: [path, value, comment]. */
export function flattenRules(text: string): { path: string; value: string; note: string }[] {
  const out: { path: string; value: string; note: string }[] = [];
  const stack: { indent: number; key: string }[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    const m = line.match(/^(\s*)([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const indent = m[1].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    let rest = m[3];
    let note = '';
    const hash = rest.search(/\s#\s/);
    if (hash >= 0) {
      note = rest.slice(hash + 3).trim();
      rest = rest.slice(0, hash).trim();
    }
    if (rest === '') {
      stack.push({ indent, key: m[2] });
      continue;
    }
    out.push({ path: [...stack.map((s) => s.key), m[2]].join('.'), value: rest.replace(/^"|"$/g, ''), note });
  }
  return out;
}
