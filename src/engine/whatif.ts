// What-if: 2027 rule (§8). Recomputes goals 2 and 3 with an earlier deadline. Goal 1 is unaffected.
import type { Ctx } from './context';
import { addYears, parseDate, type Day } from './dates';
import { computeGoal2 } from './goal2';
import { computeGoal3 } from './goal3';
import type { Alert, GoalId, Household, Person, Status } from './model';

export interface WhatIfChange {
  personId: string;
  oldEnd: Day;
  newEnd: Day;
  before: Partial<Record<GoalId, Status>>;
  after: Partial<Record<GoalId, Status>>;
}

export interface WhatIfResult {
  interpretation: 'A' | 'B';
  switchDate: Day;
  affected: number; // clients whose end of responsibility moves
  changes: WhatIfChange[]; // clients with a changed end (status may or may not change)
  delta: Record<2 | 3, Record<Status, number>>; // after - before, per status (goal 3 in households)
}

/**
 * Interpretation B (organisers): the rule applies to arrivals from the switch date and is already part of
 * every deadline (population.paymentPeriod), so nobody moves. Interpretation A (what-if): current clients
 * with a longer period also end at max(entry + 5 years, switch date).
 */
export function newEnd(p: Person, ctx: Ctx): Day | undefined {
  const w = ctx.rules.whatif_2027;
  if (w.interpretation === 'B') return undefined;
  const sw = parseDate(w.switch_date)!;
  if (p.entry === undefined || p.deadline === undefined || p.payYears === undefined || p.payYears <= w.new_years_from_entry) return undefined;
  const n = Math.min(p.deadline, Math.max(addYears(p.entry, w.new_years_from_entry), sw));
  return n < p.deadline ? n : undefined;
}

const zero = (): Record<Status, number> => ({ reached: 0, on_track: 0, at_risk: 0, missed: 0, not_applicable: 0, no_data: 0 });

export function computeWhatIf(persons: Person[], households: Household[], ctx: Ctx): WhatIfResult {
  const w = ctx.rules.whatif_2027;
  const sink: Alert[] = [];
  const moved = new Map<string, Day>();
  for (const p of persons) {
    const n = newEnd(p, ctx);
    if (n !== undefined) moved.set(p.id, n);
  }
  const sim = new Map(persons.map((p) => [p.id, moved.has(p.id) ? { ...p, deadline: moved.get(p.id)!, payEnd: moved.get(p.id)!, payYears: w.new_years_from_entry, goals: { ...p.goals } } : p]));
  const delta: WhatIfResult['delta'] = { 2: zero(), 3: zero() };
  const changes: WhatIfChange[] = [];
  for (const p of persons) {
    if (!moved.has(p.id)) continue;
    const s = sim.get(p.id)!;
    if (p.goals[2]) {
      s.goals[2] = computeGoal2(s, ctx, sink);
      delta[2][p.goals[2].status]--;
      delta[2][s.goals[2].status]++;
    }
  }
  for (const h of households) {
    if (!h.goal3 || !h.members.some((m) => moved.has(m))) continue;
    const g3 = computeGoal3(h, sim, ctx, sink);
    delta[3][h.goal3.status]--;
    delta[3][g3.status]++;
    for (const m of h.members) sim.get(m)!.goals[3] = g3;
  }
  for (const p of persons) {
    if (!moved.has(p.id)) continue;
    const s = sim.get(p.id)!;
    changes.push({
      personId: p.id,
      oldEnd: p.deadline!,
      newEnd: moved.get(p.id)!,
      before: { 2: p.goals[2]?.status, 3: p.goals[3]?.status },
      after: { 2: s.goals[2]?.status, 3: s.goals[3]?.status },
    });
  }
  return { interpretation: w.interpretation, switchDate: parseDate(w.switch_date)!, affected: moved.size, changes, delta };
}
