import { addDays, addMonths, fmt, type Day } from './dates';
import { includesAny, type Ctx } from './context';
import type { Rec } from './import/detect';
import { provenRows } from './goal1';
import { day, srcRef, str, type Alert, type GoalResult, type Msg, type Person, type TraceStep } from './model';
import { deadlineMsg, personScope } from './population';

interface Seg {
  start: Day;
  end: Day; // last day >= min pensum (capped at Stichtag)
  running: boolean; // still >= min pensum on the Stichtag
  peak: number;
}

/** Maximal runs of days with workload >= min (gaps up to maxGap days bridged). Jobs are [von, min(bis, st)]. */
export function qualifyingSegments(jobs: { von: Day; bis?: Day; pensum: number }[], st: Day, min: number, combine: boolean, maxGap: number): Seg[] {
  if (!jobs.length) return [];
  const from = Math.min(...jobs.map((j) => j.von));
  if (from > st) return [];
  const n = st - from + 1;
  const load = new Float64Array(n);
  for (const j of jobs) {
    const a = Math.max(j.von, from) - from;
    const b = Math.min(j.bis ?? st, st) - from;
    for (let i = a; i <= b; i++) load[i] = combine ? load[i] + j.pensum : Math.max(load[i], j.pensum);
  }
  const segs: Seg[] = [];
  let cur: Seg | undefined;
  let gap = 0;
  for (let i = 0; i < n; i++) {
    // a day only counts with an active job (contract) AND workload >= min (so min_pensum: 0 = "any contract")
    if (load[i] > 0 && load[i] >= min) {
      if (cur) cur.end = from + i;
      else cur = { start: from + i, end: from + i, running: false, peak: 0 };
      cur.peak = Math.max(cur.peak, load[i]);
      gap = 0;
    } else if (cur) {
      gap++;
      if (gap > maxGap) {
        segs.push(cur);
        cur = undefined;
        gap = 0;
      }
    }
  }
  if (cur) {
    cur.running = cur.end === st;
    segs.push(cur);
  }
  return segs;
}

export function computeGoal2(p: Person, ctx: Ctx, alerts: Alert[]): GoalResult {
  const { rules, st } = ctx;
  const g = rules.goal2;
  const trace: TraceStep[] = [];
  const klientSrc = srcRef(p.klientRow, ['klientNr', 'zemis', 'status', 'geburtsdatum', 'zEnde']);
  const deadline = p.deadline;
  const ageRef = rules.scope.age_reference === 'entry' ? p.entry : rules.scope.age_reference === 'deadline' ? deadline : st;
  const scope = personScope(p, ctx, ageRef);
  if (!scope.inScope) {
    trace.push({ rule: 'scope', msg: scope.reason!, sources: [klientSrc] });
    return { goal: 2, status: 'not_applicable', reason: scope.reason!, trace };
  }
  if (deadline === undefined) {
    const reason = { key: 'g2.no_deadline' };
    trace.push({ rule: 'g2.deadline', msg: reason, sources: [klientSrc] });
    return { goal: 2, status: 'no_data', reason, trace };
  }
  trace.push({ rule: 'g2.deadline', msg: deadlineMsg(p), sources: [klientSrc] });

  // --- candidates for "reached" ---
  type Cand = { date: Day; via: string; src: Rec; msg: Msg };
  const cands: Cand[] = [];
  for (const r of ctx.rowsFor('foerderung', p)) {
    if (!includesAny(r.art, g.education_types)) continue;
    const date = g.education_counts_from === 'completion' ? day(r.abschluss) : day(r.start);
    if (date === undefined || date > st) continue;
    cands.push({ date, via: 'education', src: r, msg: { key: 'g2.reached.education', p: { art: str(r.art), what: str(r.bezeichnung) || str(r.art), date: fmt(date) } } });
  }
  // employment
  const jobs: { von: Day; bis?: Day; pensum: number; rec: Rec }[] = [];
  for (const r of ctx.rowsFor('erwerb', p)) {
    const von = day(r.von);
    const bis = day(r.bis);
    const pensum = typeof r.pensum === 'number' ? r.pensum : NaN;
    if (von === undefined || isNaN(pensum) || (bis !== undefined && bis < von)) continue;
    const kw = includesAny(r.bemerkungen, g.exclude_keywords) ?? includesAny(r.arbeitgeber, g.exclude_keywords);
    if (kw) {
      trace.push({ rule: 'g2.excluded', msg: { key: 'g2.trace.excluded', p: { employer: str(r.arbeitgeber), kw } }, sources: [srcRef(r)] });
      continue;
    }
    if (!g.count_self_employed && str(r.erwerbsstatus) === 'selbstständig') continue;
    jobs.push({ von, bis, pensum, rec: r });
  }
  // overlapping jobs (merged when combine_jobs)
  const sorted = [...jobs].sort((a, b) => a.von - b.von);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if ((prev.bis ?? Infinity) >= sorted[i].von) {
      alerts.push({
        code: 'overlapping_jobs_merged',
        severity: 'info',
        personId: p.id,
        goal: 2,
        msg: { key: 'dq.overlapping_jobs_merged', p: { a: str(prev.rec.arbeitgeber), b: str(sorted[i].rec.arbeitgeber) } },
        sources: [srcRef(prev.rec, ['zemis', 'von', 'bis', 'arbeitgeber', 'pensum']), srcRef(sorted[i].rec, ['zemis', 'von', 'bis', 'arbeitgeber', 'pensum'])],
      });
      break;
    }
  }
  const segs = qualifyingSegments(jobs, st, g.min_pensum, g.combine_jobs, g.max_gap_days);
  const jobSrc = (s: Seg) => jobs.filter((j) => j.von <= s.end && (j.bis ?? st) >= s.start).map((j) => srcRef(j.rec, ['zemis', 'von', 'bis', 'arbeitgeber', 'pensum', 'erwerbsstatus']));
  for (const s of segs) {
    const done = addDays(addMonths(s.start, g.months_uninterrupted), -1);
    if (s.end >= done) cands.push({ date: done, via: 'employment', src: jobs.find((j) => j.von <= s.start && (j.bis ?? st) >= s.start)!.rec, msg: { key: 'g2.reached.job', p: { pensum: s.peak, start: fmt(s.start), date: fmt(done) } } });
  }
  cands.sort((a, b) => a.date - b.date);
  const proven = provenRows(p, ctx, 2);

  const reached = (date: Day, source: 'proven' | 'computed', via: string, msg: Msg, src: Rec): GoalResult => {
    const late = date > deadline;
    trace.push({ rule: 'g2.reached', msg, sources: [srcRef(src)] });
    return { goal: 2, status: 'reached', reason: late ? { key: 'g2.reached.late', p: { date: fmt(date), deadline: fmt(deadline) } } : msg, deadline, latestAction: deadline, reachedDate: date, late, source, via, trace };
  };
  if (proven.length) {
    if (!cands.length)
      alerts.push({ code: 'proven_not_reproduced', severity: 'info', personId: p.id, goal: 2, msg: { key: 'dq.proven_not_reproduced', p: { goal: 2, date: fmt(day(proven[0].datum)) } }, sources: [srcRef(proven[0])] });
    const pr = proven[0];
    return reached(day(pr.datum)!, 'proven', 'zielerreichung', { key: 'g2.reached.proven', p: { date: fmt(day(pr.datum)) } }, pr);
  }
  if (cands.length) {
    const c = cands[0];
    const res = reached(c.date, 'computed', c.via, c.msg, c.src);
    if (!res.late && ctx.has('zielerreichung'))
      alerts.push({ code: 'reached_not_recorded', severity: 'high', personId: p.id, goal: 2, msg: { key: 'dq.reached_not_recorded', p: { goal: 2, date: fmt(c.date) } }, sources: [srcRef(c.src)] });
    return res;
  }

  // --- not reached ---
  const latestStart = addMonths(addDays(deadline, 1), -g.months_uninterrupted);
  const base = { goal: 2 as const, deadline, latestAction: latestStart, trace };
  // Education Sek II / Tertiär still running (counts on completion): on track if it ends before the deadline.
  if (g.education_counts_from === 'completion') {
    const edu = ctx
      .rowsFor('foerderung', p)
      .filter((r) => includesAny(r.art, g.education_types) && day(r.start) !== undefined && day(r.start)! <= st && day(r.abschluss) !== undefined && day(r.abschluss)! > st)
      .sort((a, b) => day(a.abschluss)! - day(b.abschluss)!)[0];
    if (edu && day(edu.abschluss)! <= deadline) {
      const reason = { key: 'g2.on_track.education', p: { art: str(edu.art), what: str(edu.bezeichnung) || str(edu.art), date: fmt(day(edu.abschluss)) } };
      trace.push({ rule: 'g2.education_running', msg: reason, sources: [srcRef(edu)] });
      return { ...base, latestAction: day(edu.abschluss)!, status: 'on_track', reason };
    }
  }
  const running = segs.find((s) => s.running);
  if (running) {
    const done = addDays(addMonths(running.start, g.months_uninterrupted), -1);
    if (done <= deadline) {
      const reason = { key: 'g2.on_track.running', p: { pensum: running.peak, start: fmt(running.start), date: fmt(done) } };
      trace.push({ rule: 'g2.in_progress', msg: reason, sources: jobSrc(running) });
      return { ...base, latestAction: done, status: 'on_track', reason };
    }
  }
  const cur = jobs.filter((j) => j.von <= st && (j.bis ?? Infinity) >= st);
  if (cur.length) trace.push({ rule: 'g2.current_jobs', msg: { key: 'g2.trace.current', p: { pensum: g.combine_jobs ? cur.reduce((s, j) => s + j.pensum, 0) : Math.max(...cur.map((j) => j.pensum)), min: g.min_pensum } }, sources: cur.map((j) => srcRef(j.rec, ['zemis', 'von', 'bis', 'arbeitgeber', 'pensum'])) });
  const days = latestStart - st;
  if (deadline < st || st > latestStart) return { ...base, status: 'missed', reason: { key: 'g2.missed', p: { latest: fmt(latestStart), deadline: fmt(deadline) } } };
  if (latestStart <= addMonths(st, rules.at_risk_window_months)) {
    const reason = { key: cur.length ? 'g2.at_risk.parttime' : 'g2.at_risk', p: { min: g.min_pensum, latest: fmt(latestStart), days, pensum: cur.reduce((s, j) => s + j.pensum, 0) } };
    return { ...base, status: 'at_risk', reason };
  }
  return { ...base, status: 'on_track', reason: { key: 'g2.on_track', p: { min: g.min_pensum, latest: fmt(latestStart) } } };
}

/** ZEMIS Tätigkeit rows with no matching Erwerb row (§9): may hide a reached goal 2. */
export function zemisCheck(p: Person, ctx: Ctx, alerts: Alert[]) {
  const tol = ctx.rules.dq.date_tolerance_days;
  const erw = ctx.rowsFor('erwerb', p);
  for (const z of ctx.rowsFor('zemis', p)) {
    const zv = day(z.von);
    if (zv === undefined) continue;
    const zb = day(z.bis) ?? Infinity;
    let best = 0;
    for (const e of erw) {
      const ev = day(e.von);
      if (ev === undefined) continue;
      const eb = day(e.bis) ?? Infinity;
      const overlap = ev - tol <= zb && zv - tol <= eb;
      if (!overlap) continue;
      best = Math.max(best, employerSimilarity(str(z.betrieb), str(e.arbeitgeber), ctx.rules.dq.legal_forms_to_strip));
    }
    if (best < ctx.rules.dq.employer_match_threshold)
      alerts.push({
        code: 'zemis_job_not_in_erwerb',
        severity: 'high',
        personId: p.id,
        goal: 2,
        msg: { key: best > 0.5 ? 'dq.zemis_job_possible' : 'dq.zemis_job_not_in_erwerb', p: { betrieb: str(z.betrieb), von: fmt(zv), score: Math.round(best * 100) } },
        sources: [srcRef(z)],
      });
  }
}

export function normEmployer(s: string, forms: string[]): string[] {
  let t = s.toLowerCase().split(' / einsatzort')[0];
  t = t.replace(/\b\d{4}\b/g, ' ');
  for (const f of forms) t = t.replace(new RegExp(`(^|\\s)${f.toLowerCase().replace(/[.&]/g, '\\$&')}(?=\\s|$|,)`, 'g'), ' ');
  return t
    .replace(/[^a-zäöüéèàç0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 1);
}

/** Token-set ratio: shared tokens over the smaller token set (so "Adecco" matches "Adecco Hotel & Event Bern"). */
export function employerSimilarity(a: string, b: string, forms: string[]): number {
  const A = new Set(normEmployer(a, forms));
  const B = new Set(normEmployer(b, forms));
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const w of A) if (B.has(w)) inter++;
  return inter / Math.min(A.size, B.size);
}
