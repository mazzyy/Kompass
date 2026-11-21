import { addMonths, fmt, monthsBetween, type Day } from './dates';
import type { Ctx } from './context';
import { personScope } from './population';
import { day, str, type CallItem, type GoalId, type Msg, type Person } from './model';

/** Latest date of any course, job or language record up to the Stichtag (§11.3). */
export function lastActivity(p: Person, ctx: Ctx): Day | undefined {
  const st = ctx.st;
  const ds: Day[] = [];
  for (const r of ctx.rowsFor('foerderung', p)) {
    const s = day(r.start);
    const e = day(r.abschluss);
    if (s !== undefined && s <= st) ds.push(e === undefined || e > st ? st : e, s);
  }
  for (const r of ctx.rowsFor('erwerb', p)) {
    const s = day(r.von);
    const e = day(r.bis);
    if (s !== undefined && s <= st) ds.push(e === undefined || e > st ? st : e, s);
  }
  for (const r of ctx.rowsFor('sprachstand', p)) {
    const dd = day(r.datum);
    if (dd !== undefined && dd <= st) ds.push(dd);
  }
  return ds.length ? Math.max(...ds) : undefined;
}

interface Transition {
  what: string;
  end: Day;
}

/** A course / bridging programme / job ending within N months with nothing recorded after it (§11.4). */
export function findTransition(p: Person, ctx: Ctx): Transition | undefined {
  const st = ctx.st;
  const horizon = addMonths(st, ctx.rules.calls.transition_months);
  const items: { what: string; start: Day; end?: Day }[] = [];
  for (const r of ctx.rowsFor('foerderung', p)) {
    const s = day(r.start);
    if (s !== undefined) items.push({ what: str(r.bezeichnung) || str(r.art), start: s, end: day(r.abschluss) });
  }
  for (const r of ctx.rowsFor('erwerb', p)) {
    const s = day(r.von);
    if (s !== undefined) items.push({ what: str(r.arbeitgeber) || 'Erwerb', start: s, end: day(r.bis) });
  }
  const ending = items
    .filter((i) => i.start <= st && i.end !== undefined && i.end > st && i.end <= horizon)
    .sort((a, b) => a.end! - b.end!);
  for (const e of ending) {
    const follows = items.some((i) => i !== e && (i.end === undefined || i.end > e.end!));
    if (!follows) return { what: e.what, end: e.end! };
  }
  return undefined;
}

const goalOpen = (p: Person, g: GoalId) => {
  if (g === 3 && !p.isHead) return false; // household goal: acted on via the head of the household
  const r = p.goals[g];
  return r !== undefined && r.status !== 'reached' && r.status !== 'not_applicable' && r.status !== 'no_data';
};

/** Any goal still open? Goals not computed in this run count as open when the person is in scope. */
function anyGoalOpen(p: Person, ctx: Ctx, computed: GoalId[]): boolean {
  if (computed.some((g) => goalOpen(p, g))) return true;
  if (!computed.includes(2) && personScope(p, ctx, ctx.st).inScope) return true;
  return false;
}

function talkingPointsFor(p: Person, g: GoalId): Msg[] {
  const r = p.goals[g]!;
  const dl = fmt(r.latestAction ?? r.deadline);
  if (g === 1) {
    if (r.proofIssue) return [{ key: 'tp.g1.proof' }, { key: 'tp.g1.book_exam', p: { deadline: dl } }];
    return [{ key: 'tp.g1.book_exam', p: { deadline: dl } }, { key: 'tp.g1.course', p: { deadline: dl } }, { key: 'tp.g1.barriers' }];
  }
  if (g === 2) return [{ key: 'tp.g2.job', p: { date: dl } }, { key: 'tp.g2.pensum' }];
  return [{ key: 'tp.g3.income', p: { date: dl } }, { key: 'tp.g3.budget' }];
}

export function buildCallLists(persons: Person[], ctx: Ctx, computed: GoalId[]): Record<string, CallItem[]> {
  const st = ctx.st;
  const inactiveSince = addMonths(st, -ctx.rules.calls.inactive_months);
  const items: CallItem[] = [];
  for (const p of persons) {
    const reasons: Msg[] = [];
    const tps: Msg[] = [];
    let best: CallItem | undefined;
    const consider = (c: CallItem) => {
      if (!best || c.category < best.category || (c.category === best.category && c.sortKey < best.sortKey))
        best = c;
    };
    // 1. at risk
    for (const g of computed) {
      const r = p.goals[g];
      if (r?.status !== 'at_risk' || (g === 3 && !p.isHead)) continue;
      const k = r.latestAction ?? r.deadline!;
      reasons.push(r.reason);
      tps.push(...talkingPointsFor(p, g));
      consider({ personId: p.id, category: 1, goal: g, keyDate: k, daysLeft: k - st, sortKey: k - st, lead: r.reason, reasons: [], talkingPoints: [] });
    }
    // 2. missed but fixable by a data fix
    for (const g of computed) {
      const r = p.goals[g];
      if (r?.status !== 'missed' || !r.proofIssue) continue;
      reasons.push(r.reason);
      tps.push(...talkingPointsFor(p, g));
      consider({ personId: p.id, category: 2, goal: g, keyDate: r.deadline, daysLeft: (r.deadline ?? st) - st, sortKey: st - (r.deadline ?? st), lead: r.reason, reasons: [], talkingPoints: [] });
    }
    const anyOpen = anyGoalOpen(p, ctx, computed);
    // 3. inactive
    const la = lastActivity(p, ctx);
    if (anyOpen && (la === undefined || la < inactiveSince)) {
      const since = la ?? p.entry ?? p.zBeginn;
      const months = since !== undefined ? monthsBetween(since, st) : undefined;
      const lead: Msg = la !== undefined ? { key: 'call.inactive', p: { months: months!, date: fmt(la) } } : { key: 'call.inactive_never' };
      reasons.push(lead);
      tps.push({ key: 'tp.inactive' });
      consider({ personId: p.id, category: 3, keyDate: la, sortKey: la !== undefined ? la - st : -1e6, lead, reasons: [], talkingPoints: [] });
    }
    // 4. transition
    const tr = anyOpen ? findTransition(p, ctx) : undefined;
    if (tr) {
      const lead: Msg = { key: 'call.transition', p: { what: tr.what, date: fmt(tr.end), days: tr.end - st } };
      reasons.push(lead);
      tps.push({ key: 'tp.transition', p: { what: tr.what, date: fmt(tr.end) } });
      consider({ personId: p.id, category: 4, keyDate: tr.end, daysLeft: tr.end - st, sortKey: tr.end - st, lead, reasons: [], talkingPoints: [] });
    }
    if (best) {
      const b: CallItem = best;
      b.reasons = dedupe(reasons);
      b.talkingPoints = dedupe(tps);
      items.push(b);
    }
  }
  // Rank: category, then days left (inactive: longest first because daysLeft is negative age). Never by money.
  items.sort((a, b) => a.category - b.category || a.sortKey - b.sortKey || a.personId.localeCompare(b.personId));
  const bySw: Record<string, CallItem[]> = {};
  const swOf = new Map(persons.map((p) => [p.id, p.socialWorker]));
  for (const it of items) (bySw[swOf.get(it.personId)!] ??= []).push(it);
  return bySw;
}

function dedupe(ms: Msg[]): Msg[] {
  const seen = new Set<string>();
  return ms.filter((m) => {
    const k = JSON.stringify(m);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
