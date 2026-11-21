import { addMonths, addYears, fmt, monthsBetween, type Day } from './dates';
import { includesAny, type Ctx } from './context';
import type { Rec } from './import/detect';
import { day, srcRef, str, type Alert, type GoalResult, type Msg, type Person, type TraceStep } from './model';
import { personScope } from './population';

export function levelIndex(level: unknown, order: string[]): number {
  const m = String(level ?? '').toUpperCase().match(/[ABC][0-2]/);
  return m ? order.indexOf(m[0]) : -1;
}

/** Rows of Integrationszielerreichung for the person, mapped to a goal by keyword. */
export function provenRows(p: Person, ctx: Ctx, goal: 1 | 2 | 3): Rec[] {
  const gm = ctx.rules.goal_mapping;
  const kw = [gm.goal1_keywords, gm.goal2_keywords, gm.goal3_keywords];
  return ctx
    .rowsFor('zielerreichung', p)
    .filter((r) => {
      if (gm.ignore_status_s_rows && r.statusS === true) return false;
      // first matching goal wins, so a row maps to exactly one goal
      const g = kw.findIndex((words) => includesAny(r.art, words));
      return g + 1 === goal && day(r.datum) !== undefined;
    })
    .sort((a, b) => day(a.datum)! - day(b.datum)!);
}

export function languageCourses(p: Person, ctx: Ctx): Rec[] {
  const kw = ctx.rules.goal1.language_course_keywords;
  return ctx
    .rowsFor('foerderung', p)
    .filter((r) => includesAny(r.art, kw) || includesAny(r.bezeichnung, kw))
    .filter((r) => day(r.start) !== undefined);
}

export function computeGoal1(p: Person, ctx: Ctx, alerts: Alert[]): GoalResult {
  const { rules, st } = ctx;
  const g = rules.goal1;
  const trace: TraceStep[] = [];
  const klientSrc = srcRef(p.klientRow, ['klientNr', 'zemis', 'status', 'geburtsdatum', 'muttersprache']);
  const events = ctx.rowsFor('asylgeschaeftsdaten', p);
  const entryRow = events
    .filter((e) => str(e.art) === g.entry_event && day(e.datum) !== undefined)
    .sort((a, b) => day(a.datum)! - day(b.datum)!)[0];
  const entry = entryRow ? day(entryRow.datum) : undefined;
  const deadline = entry !== undefined ? addYears(entry, g.years_from_entry) : undefined;

  // Scope (status, age)
  const ageRef = rules.scope.age_reference === 'entry' ? entry : rules.scope.age_reference === 'deadline' ? deadline : st;
  const scope = personScope(p, ctx, ageRef);
  if (!scope.inScope) {
    trace.push({ rule: 'scope', msg: scope.reason!, sources: [klientSrc] });
    return { goal: 1, status: 'not_applicable', reason: scope.reason!, trace };
  }

  if (entry === undefined || deadline === undefined) {
    const birthRow = events.find((e) => str(e.art) === g.birth_event);
    if (birthRow) {
      alerts.push({
        code: 'born_in_ch',
        severity: 'info',
        personId: p.id,
        goal: 1,
        msg: { key: 'dq.born_in_ch' },
        sources: [srcRef(birthRow, ['zemis', 'art', 'datum'])],
      });
      const reason = { key: 'g1.na.born_ch' };
      trace.push({ rule: 'g1.entry', msg: reason, sources: [srcRef(birthRow, ['zemis', 'art', 'datum'])] });
      return { goal: 1, status: 'not_applicable', reason, trace };
    }
    alerts.push({
      code: 'missing_entry_event',
      severity: 'medium',
      personId: p.id,
      goal: 1,
      msg: { key: 'dq.missing_entry_event', p: { event: g.entry_event } },
      sources: [klientSrc],
    });
    const reason = { key: 'g1.no_entry', p: { event: g.entry_event } };
    trace.push({ rule: 'g1.entry', msg: reason, sources: [klientSrc] });
    return { goal: 1, status: 'no_data', reason, trace };
  }

  const entrySrc = srcRef(entryRow!, ['zemis', 'art', 'datum']);
  trace.push({
    rule: 'g1.deadline',
    msg: { key: 'g1.trace.deadline', p: { entry: fmt(entry), years: g.years_from_entry, deadline: fmt(deadline) } },
    sources: [entrySrc],
  });

  // --- reached? ---
  const proven = provenRows(p, ctx, 1);
  const minIdx = g.level_order.indexOf(g.min_level);
  const langRows = ctx.rowsFor('sprachstand', p);
  const counting = langRows.filter(
    (r) => g.languages_counting.some((l) => l.toLowerCase() === str(r.sprache).toLowerCase()) && levelIndex(r.niveau, g.level_order) >= minIdx,
  );
  const accepted = counting
    .filter((r) => includesAny(r.art, g.accepted_proof) && day(r.datum) !== undefined)
    .sort((a, b) => day(a.datum)! - day(b.datum)!);
  const notAccepted = counting.filter((r) => !includesAny(r.art, g.accepted_proof));
  const motherTongue =
    g.mother_tongue_counts && g.languages_counting.some((l) => l.toLowerCase() === str(p.klientRow.muttersprache).toLowerCase());

  let computedDate: Day | undefined;
  let computedVia: string | undefined;
  let computedSrc: Rec | undefined;
  if (accepted.length) {
    computedDate = day(accepted[0].datum);
    computedVia = 'sprachstand';
    computedSrc = accepted[0];
  }
  if (motherTongue && (computedDate === undefined || entry < computedDate)) {
    computedDate = entry;
    computedVia = 'muttersprache';
    computedSrc = p.klientRow;
  }

  const finishReached = (date: Day, source: 'proven' | 'computed', via: string, srcRec: Rec): GoalResult => {
    const late = date > deadline;
    const p2 = {
      date: fmt(date),
      deadline: fmt(deadline),
      level: str(srcRec.niveau),
      art: str(srcRec.art),
      sprache: str(srcRec.sprache),
    };
    const key =
      via === 'zielerreichung' ? 'g1.reached.proven' : via === 'muttersprache' ? 'g1.reached.mother' : 'g1.reached.cert';
    const reason = { key: late ? key + '_late' : key, p: p2 };
    trace.push({ rule: 'g1.reached', msg: reason, sources: [srcRef(srcRec)] });
    return {
      goal: 1,
      status: 'reached',
      reason,
      deadline,
      latestAction: deadline,
      reachedDate: date,
      late,
      source,
      via,
      trace,
    };
  };

  if (proven.length) {
    const pr = proven[0];
    if (computedDate === undefined) {
      alerts.push({
        code: 'proven_not_reproduced',
        severity: 'info',
        personId: p.id,
        goal: 1,
        msg: { key: 'dq.proven_not_reproduced', p: { goal: 1, date: fmt(day(pr.datum)) } },
        sources: [srcRef(pr)],
      });
    }
    return finishReached(day(pr.datum)!, 'proven', 'zielerreichung', pr);
  }
  if (computedDate !== undefined) {
    const res = finishReached(computedDate, 'computed', computedVia!, computedSrc!);
    if (!res.late && ctx.has('zielerreichung')) {
      alerts.push({
        code: 'reached_not_recorded',
        severity: 'high',
        personId: p.id,
        goal: 1,
        msg: { key: 'dq.reached_not_recorded', p: { goal: 1, date: fmt(computedDate) } },
        sources: [srcRef(computedSrc!)],
      });
    }
    return res;
  }

  // --- not reached ---
  const proofIssue = notAccepted.length > 0;
  if (proofIssue) {
    const r = notAccepted[notAccepted.length - 1];
    alerts.push({
      code: 'a1_without_accepted_proof',
      severity: 'high',
      personId: p.id,
      goal: 1,
      msg: { key: 'dq.a1_without_accepted_proof', p: { level: str(r.niveau), art: str(r.art) } },
      sources: [srcRef(r)],
    });
    trace.push({
      rule: 'g1.proof',
      msg: { key: 'g1.trace.proof_not_accepted', p: { level: str(r.niveau), art: str(r.art), date: fmt(day(r.datum)) } },
      sources: [srcRef(r)],
    });
  }
  const latestLang = [...langRows].sort((a, b) => (day(b.datum) ?? 0) - (day(a.datum) ?? 0))[0];
  if (latestLang && !proofIssue)
    trace.push({
      rule: 'g1.level',
      msg: { key: 'g1.trace.level', p: { level: str(latestLang.niveau), date: fmt(day(latestLang.datum)), art: str(latestLang.art) } },
      sources: [srcRef(latestLang)],
    });

  const courses = languageCourses(p, ctx);
  const pastCourses = courses.filter((c) => day(c.abschluss) !== undefined && day(c.abschluss)! < st);
  const lastCourse = pastCourses.sort((a, b) => day(b.abschluss)! - day(a.abschluss)!)[0];
  const activeCourse = courses
    .filter((c) => day(c.start)! <= st && (day(c.abschluss) === undefined || day(c.abschluss)! >= st))
    .sort((a, b) => (day(b.abschluss) ?? Infinity) - (day(a.abschluss) ?? Infinity))[0];
  if (lastCourse && !activeCourse)
    trace.push({
      rule: 'g1.course',
      msg: { key: 'g1.trace.last_course', p: { course: str(lastCourse.bezeichnung) || str(lastCourse.art), end: fmt(day(lastCourse.abschluss)) } },
      sources: [srcRef(lastCourse)],
    });

  const base = { goal: 1 as const, deadline, latestAction: deadline, proofIssue, trace };
  const days = deadline - st;
  const months = monthsBetween(st, deadline);
  if (st > deadline) {
    const reason = { key: proofIssue ? 'g1.missed.proof' : 'g1.missed', p: { deadline: fmt(deadline), art: proofIssue ? str(notAccepted[0].art) : '' } };
    return { ...base, status: 'missed', reason };
  }
  const windowEnd = addMonths(st, rules.at_risk_window_months);
  if (deadline <= windowEnd) {
    const ae = activeCourse ? day(activeCourse.abschluss) : undefined;
    if (g.active_course_softens_risk && activeCourse && ae !== undefined && ae <= deadline) {
      const reason = {
        key: 'g1.on_track.course',
        p: { course: str(activeCourse.bezeichnung) || str(activeCourse.art), end: fmt(ae), deadline: fmt(deadline), days },
      };
      trace.push({ rule: 'g1.course_softens', msg: reason, sources: [srcRef(activeCourse)] });
      return { ...base, status: 'on_track', reason };
    }
    const p2: Record<string, string | number> = { deadline: fmt(deadline), days, months };
    let key = 'g1.at_risk';
    if (proofIssue) {
      key = 'g1.at_risk.proof';
      p2.art = str(notAccepted[0].art);
    } else if (activeCourse) {
      key = 'g1.at_risk.course_late';
      p2.course = str(activeCourse.bezeichnung) || str(activeCourse.art);
      p2.end = fmt(ae);
    } else if (lastCourse) {
      key = 'g1.at_risk.last_course';
      p2.end = fmt(day(lastCourse.abschluss));
    } else key = 'g1.at_risk.no_course';
    return { ...base, status: 'at_risk', reason: { key, p: p2 } };
  }
  const reason: Msg = activeCourse
    ? { key: 'g1.on_track.running', p: { deadline: fmt(deadline), months, course: str(activeCourse.bezeichnung) || str(activeCourse.art) } }
    : { key: 'g1.on_track', p: { deadline: fmt(deadline), months } };
  return { ...base, status: 'on_track', reason };
}
