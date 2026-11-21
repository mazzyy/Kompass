import { addDays, addMonths, fmt, type Day } from './dates';
import type { Ctx } from './context';
import type { Rec } from './import/detect';
import { provenRows } from './goal1';
import { day, srcRef, str, type Alert, type GoalResult, type Household, type Person, type TraceStep } from './model';

const HEAD = 'Dossierträger/-in';

/** Households (Dossier-Nr.) with the members active on the Stichtag; falls back to Klient's Dossier-Nr. */
export function buildHouseholds(persons: Person[], ctx: Ctx, alerts: Alert[]): Household[] {
  const st = ctx.st;
  const byKnr = new Map(persons.map((p) => [p.klientNr, p]));
  const byZemis = new Map(persons.map((p) => [p.zemis, p]));
  const map = new Map<string, { members: Set<string>; head?: string; rows: Rec[] }>();
  const get = (d: string) => {
    if (!map.has(d)) map.set(d, { members: new Set(), rows: [] });
    return map.get(d)!;
  };
  if (ctx.has('dossierperson')) {
    for (const r of ctx.tables.dossierperson!) {
      const von = day(r.von);
      const bis = day(r.bis);
      if ((von !== undefined && von > st) || (bis !== undefined && bis < st)) continue;
      const p = byZemis.get(str(r.zemis)) ?? byKnr.get(str(r.klientNr));
      if (!p) continue;
      const h = get(str(r.dossierNr));
      h.members.add(p.id);
      h.rows.push(r);
      if (str(r.beziehung) === HEAD) h.head = p.id;
    }
  }
  for (const p of persons) if (p.dossierNr && ![...map.values()].some((h) => h.members.has(p.id))) get(p.dossierNr).members.add(p.id);
  const out: Household[] = [];
  const byId = new Map(persons.map((p) => [p.id, p]));
  for (const [dossierNr, h] of map) {
    if (!h.members.size) continue;
    if (!h.head && ctx.has('dossierperson'))
      alerts.push({ code: 'household_without_head', severity: 'medium', msg: { key: 'dq.household_without_head', p: { dossier: dossierNr } }, sources: h.rows.slice(0, 3).map((r) => srcRef(r)) });
    const members = [...h.members].sort();
    const head = h.head ?? members.map((m) => byId.get(m)!).sort((a, b) => (a.birth ?? 0) - (b.birth ?? 0))[0].id;
    out.push({ dossierNr, members, head, socialWorker: byId.get(head)!.socialWorker });
  }
  return out.sort((a, b) => a.dossierNr.localeCompare(b.dossierNr));
}

interface Period {
  von: Day;
  bis: Day; // inclusive; open = far future
  rec: Rec;
}

export function computeGoal3(h: Household, persons: Map<string, Person>, ctx: Ctx, alerts: Alert[]): GoalResult {
  const { rules, st } = ctx;
  const g = rules.goal3;
  const trace: TraceStep[] = [];
  const members = h.members.map((m) => persons.get(m)!);
  const head = persons.get(h.head!)!;
  const headSrc = srcRef(head.klientRow, ['klientNr', 'zemis', 'dossierNr', 'zBeginn', 'zEnde', 'status']);
  const inScope = members.some((m) => rules.scope.statuses.includes(m.status) && !rules.scope.excluded_statuses.includes(m.status));
  if (!inScope) {
    const reason = { key: 'g3.na.status', p: { statuses: [...new Set(members.map((m) => m.status))].join(', ') } };
    trace.push({ rule: 'scope', msg: reason, sources: [headSrc] });
    return { goal: 3, status: 'not_applicable', reason, trace };
  }
  const ends = members.map((m) => m.zEnde).filter((d): d is Day => d !== undefined);
  const deadline = g.deadline_from === 'head' && head.zEnde !== undefined ? head.zEnde : g.deadline_from === 'earliest_member' ? Math.min(...ends) : ends.length ? Math.max(...ends) : undefined;
  if (deadline === undefined) {
    const reason = { key: 'g3.no_deadline' };
    trace.push({ rule: 'g3.deadline', msg: reason, sources: [headSrc] });
    return { goal: 3, status: 'no_data', reason, trace };
  }
  trace.push({ rule: 'g3.deadline', msg: { key: 'g3.trace.deadline', p: { deadline: fmt(deadline), who: head.displayName } }, sources: [headSrc] });

  const starts = members.map((m) => m.zBeginn).filter((d): d is Day => d !== undefined);
  const hhStart = starts.length ? Math.min(...starts) : undefined;
  const rows = ctx.rowsForDossier('finanz', h.dossierNr);
  const support: Period[] = rows
    .filter((r) => g.support_types.includes(str(r.art)) && day(r.von) !== undefined)
    .map((r) => ({ von: day(r.von)!, bis: day(r.bis) ?? 1e9, rec: r }))
    .filter((r) => r.bis >= r.von)
    .sort((a, b) => a.von - b.von);
  // merge support periods
  const merged: Period[] = [];
  for (const s of support) {
    const last = merged[merged.length - 1];
    if (last && s.von <= last.bis + 1) last.bis = Math.max(last.bis, s.bis);
    else merged.push({ ...s });
  }
  const start = hhStart ?? (merged[0]?.von ?? st);
  // free intervals inside [start, st]
  const free: { von: Day; bis: Day }[] = [];
  let t = start;
  for (const s of merged) {
    if (s.von > t) free.push({ von: t, bis: Math.min(s.von - 1, st) });
    t = Math.max(t, s.bis + 1);
    if (t > st) break;
  }
  if (t <= st) free.push({ von: t, bis: st });
  const freeNow = free.find((f) => f.bis === st && !merged.some((s) => s.von <= st && s.bis >= st));
  const finSrc = rows.map((r) => srcRef(r));
  trace.push({ rule: 'g3.support', msg: { key: 'g3.trace.support', p: { n: merged.length, start: fmt(start) } }, sources: finSrc });

  const proven = members.flatMap((m) => provenRows(m, ctx, 3)).sort((a, b) => day(a.datum)! - day(b.datum)!);
  const months = g.months_without_support;
  const reachedFree = free.find((f) => f.bis >= addDays(addMonths(f.von, months), -1));
  const result = (r: Omit<GoalResult, 'goal' | 'trace'>): GoalResult => ({ goal: 3, trace, ...r });
  if (proven.length) {
    const d = day(proven[0].datum)!;
    if (!reachedFree)
      alerts.push({ code: 'proven_not_reproduced', severity: 'info', personId: head.id, goal: 3, msg: { key: 'dq.proven_not_reproduced', p: { goal: 3, date: fmt(d) } }, sources: [srcRef(proven[0])] });
    return result({ status: 'reached', reason: { key: 'g3.reached.proven', p: { date: fmt(d) } }, deadline, latestAction: deadline, reachedDate: d, late: d > deadline, source: 'proven', via: 'zielerreichung' });
  }
  if (reachedFree) {
    const d = addDays(addMonths(reachedFree.von, months), -1);
    const late = d > deadline;
    const reason = { key: late ? 'g3.reached.late' : 'g3.reached', p: { from: fmt(reachedFree.von), date: fmt(d), deadline: fmt(deadline) } };
    trace.push({ rule: 'g3.reached', msg: reason, sources: finSrc });
    if (!late && ctx.has('zielerreichung'))
      alerts.push({ code: 'reached_not_recorded', severity: 'high', personId: head.id, goal: 3, msg: { key: 'dq.reached_not_recorded', p: { goal: 3, date: fmt(d) } }, sources: finSrc.slice(0, 3) });
    return result({ status: 'reached', reason, deadline, latestAction: deadline, reachedDate: d, late, source: 'computed', via: 'free_interval' });
  }
  if (freeNow) {
    const done = addDays(addMonths(freeNow.von, months), -1);
    if (done <= deadline) return result({ status: 'on_track', reason: { key: 'g3.on_track.free', p: { from: fmt(freeNow.von), date: fmt(done) } }, deadline, latestAction: done });
    return result({ status: 'missed', reason: { key: 'g3.missed.free', p: { from: fmt(freeNow.von), date: fmt(done), deadline: fmt(deadline) } }, deadline, latestAction: deadline });
  }
  const latestFirstFree = addMonths(addDays(deadline, 1), -months);
  const lastSupport = addDays(latestFirstFree, -1);
  const days = lastSupport - st;
  if (st > latestFirstFree || deadline < st) return result({ status: 'missed', reason: { key: 'g3.missed', p: { date: fmt(lastSupport), deadline: fmt(deadline) } }, deadline, latestAction: lastSupport });
  if (latestFirstFree <= addMonths(st, rules.at_risk_window_months))
    return result({ status: 'at_risk', reason: { key: 'g3.at_risk', p: { date: fmt(lastSupport), days, deadline: fmt(deadline) } }, deadline, latestAction: lastSupport });
  return result({ status: 'on_track', reason: { key: 'g3.on_track', p: { date: fmt(lastSupport) } }, deadline, latestAction: lastSupport });
}
