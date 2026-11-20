import { describe, expect, it } from 'vitest';
import { addYears, d, fmt } from '../src/engine/dates';
import { defaultRules } from '../src/engine/defaultRules';
import { addPerson, course, Fx, g, lang } from './fixtures';

describe('Scope (TS)', () => {
  it('TS-01 status S -> not applicable "Status S"', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'S' });
    const r = g(fx.run(), p.knr).goals[1]!;
    expect(r.status).toBe('not_applicable');
    expect(r.reason).toEqual({ key: 'na.status', p: { status: 'S' } });
  });
  it('TS-02 status N (Asylsuchende) -> not applicable', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'N (Asylsuchende)' });
    expect(g(fx.run(), p.knr).goals[1]!.status).toBe('not_applicable');
  });
  it('TS-03 VA+7 -> past end of responsibility', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'VA+7' });
    const r = g(fx.run(), p.knr).goals[1]!;
    expect(r.status).toBe('not_applicable');
    expect(r.reason.key).toBe('na.past_responsibility');
  });
  it('TS-04 born 21.11.2010 (15 on Stichtag) -> under 16', () => {
    const fx = new Fx();
    const p = addPerson(fx, { birth: '21.11.2010' });
    const r = g(fx.run(), p.knr).goals[1]!;
    expect(r.status).toBe('not_applicable');
    expect(r.reason.key).toBe('na.under_age');
  });
  it('TS-05 born 20.11.2010 (turns 16 on Stichtag) -> in scope', () => {
    const fx = new Fx();
    const p = addPerson(fx, { birth: '20.11.2010' });
    expect(g(fx.run(), p.knr).goals[1]!.status).not.toBe('not_applicable');
  });
  it('TS-06 ZE 19.11.2026 -> not a current client', () => {
    const fx = new Fx();
    const p = addPerson(fx, { ze: '19.11.2026' });
    expect(fx.run().persons.find((x) => x.klientNr === p.knr)).toBeUndefined();
  });
  it('TS-07 handed over 01.10.2026 -> not a current client', () => {
    const fx = new Fx();
    const p = addPerson(fx, { uebergang: '01.10.2026' });
    expect(fx.run().persons.find((x) => x.klientNr === p.knr)).toBeUndefined();
  });
  it('ZE on Stichtag is still current', () => {
    const fx = new Fx();
    const p = addPerson(fx, { ze: '20.11.2026' });
    expect(fx.run().persons.find((x) => x.klientNr === p.knr)).toBeDefined();
  });
  it('status history (Asylverfahrensstand) wins over Klient, with a mismatch alert', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'VA' });
    fx.add('asylverfahrensstand', { zemis: p.zemis, klientNr: p.knr, von: '01.01.2020', bis: '31.12.2024', status: 'N (Asylsuchende)' });
    fx.add('asylverfahrensstand', { zemis: p.zemis, klientNr: p.knr, von: '01.01.2025', status: 'S' });
    const res = fx.run();
    expect(g(res, p.knr).status).toBe('S');
    expect(res.alerts.some((a) => a.code === 'status_mismatch' && a.personId === p.knr)).toBe(true);
  });
});

describe('Goal 1 (T1)', () => {
  it('T1-01 Amina: deadline 12.03.2027 -> at risk, reason has deadline and last course end', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '12.03.2024', status: 'VA' });
    lang(fx, p, 'A0', 'Einstufung', '03.05.2024');
    course(fx, p, 'Deutschkurs', 'Deutsch A1 Intensiv', '01.10.2025', '14.03.2026');
    const r = g(fx.run(), p.knr).goals[1]!;
    expect(fmt(r.deadline)).toBe('12.03.2027');
    expect(r.status).toBe('at_risk');
    expect(r.reason.key).toBe('g1.at_risk.last_course');
    expect(r.reason.p).toMatchObject({ deadline: '12.03.2027', end: '14.03.2026', days: 112 });
  });
  it('T1-02 Yonas: A1 Kursbestätigung, deadline passed -> missed + a1_without_accepted_proof', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '02.10.2023', status: 'B-FL' });
    lang(fx, p, 'A1', 'Kursbestätigung', '20.09.2026');
    const res = fx.run();
    const r = g(res, p.knr).goals[1]!;
    expect(fmt(r.deadline)).toBe('02.10.2026');
    expect(r.status).toBe('missed');
    expect(r.proofIssue).toBe(true);
    expect(res.alerts.some((a) => a.code === 'a1_without_accepted_proof' && a.personId === p.knr && a.severity === 'high')).toBe(true);
  });
  it('T1-03 Mohammad: A0, course ended 14.02.2026 -> on track, inactive 9 months in call list', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '09.08.2025', birth: '01.01.1974' });
    lang(fx, p, 'A0', 'Einstufung', '20.09.2025');
    course(fx, p, 'Deutschkurs', 'Deutsch Alpha', '01.10.2025', '14.02.2026');
    const res = fx.run();
    const r = g(res, p.knr).goals[1]!;
    expect(fmt(r.deadline)).toBe('09.08.2028');
    expect(r.status).toBe('on_track');
    const item = res.callLists['S. Keller'].find((c) => c.personId === p.knr)!;
    expect(item.category).toBe(3);
    expect(item.lead).toEqual({ key: 'call.inactive', p: { months: 9, date: '14.02.2026' } });
  });
  it('T1-04 A1 fide on time -> reached', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.01.2024' });
    lang(fx, p, 'A1', 'Zertifikat fide', '15.06.2025');
    const r = g(fx.run(), p.knr).goals[1]!;
    expect(r.status).toBe('reached');
    expect(r.late).toBe(false);
    expect(fmt(r.reachedDate)).toBe('15.06.2025');
  });
  it('T1-05 A1 telc after deadline -> reached late', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.01.2022' });
    lang(fx, p, 'A1', 'Zertifikat telc', '10.03.2025');
    const r = g(fx.run(), p.knr).goals[1]!;
    expect(fmt(r.deadline)).toBe('01.01.2025');
    expect(r.status).toBe('reached');
    expect(r.late).toBe(true);
  });
  it('T1-06 mother tongue German -> reached at entry', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.05.2024', muttersprache: 'Deutsch' });
    const r = g(fx.run(), p.knr).goals[1]!;
    expect(r.status).toBe('reached');
    expect(r.via).toBe('muttersprache');
    expect(fmt(r.reachedDate)).toBe('01.05.2024');
  });
  it('T1-07 no entry event -> excluded from goal-1 totals, alert, note', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: null, status: 'VA', birth: '01.01.1996' });
    addPerson(fx, { entry: '01.01.2025' });
    const res = fx.run();
    const r = g(res, p.knr).goals[1]!;
    expect(r.status).toBe('no_data');
    expect(res.alerts.some((a) => a.code === 'missing_entry_event' && a.personId === p.knr)).toBe(true);
    expect(res.notes).toContainEqual({ key: 'note.no_entry', p: { n: 1 } });
    expect(res.totals[1]!.overall.counts.no_data).toBe(1);
    expect(res.totals[1]!.overall.counted).toBe(1);
  });
  it('T1-08 only Aufenthalt (Geburt) -> not applicable born in CH + info alert', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: null, birthEvent: true, birth: '01.01.2008' });
    const res = fx.run();
    const r = g(res, p.knr).goals[1]!;
    expect(r.status).toBe('not_applicable');
    expect(r.reason.key).toBe('g1.na.born_ch');
    expect(res.alerts.some((a) => a.code === 'born_in_ch' && a.severity === 'info')).toBe(true);
  });
  it('T1-09 active course ending before deadline softens risk -> on track', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '15.12.2023' });
    course(fx, p, 'Deutschkurs', 'Deutsch A2', '01.09.2026', '30.11.2026');
    const r = g(fx.run(), p.knr).goals[1]!;
    expect(fmt(r.deadline)).toBe('15.12.2026');
    expect(r.status).toBe('on_track');
    expect(r.reason.key).toBe('g1.on_track.course');
  });
  it('T1-10 same without the course -> at risk', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '15.12.2023' });
    expect(g(fx.run(), p.knr).goals[1]!.status).toBe('at_risk');
  });
  it('T1-11 entry 29.02.2024 -> deadline 28.02.2027', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '29.02.2024' });
    expect(fmt(g(fx.run(), p.knr).goals[1]!.deadline)).toBe('28.02.2027');
    expect(fmt(addYears(d('29.02.2024'), 3))).toBe('28.02.2027');
  });
  it('T1-12 proven row without Sprachstand -> reached (proven) + proven_not_reproduced', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.01.2024' });
    fx.add('zielerreichung', { zemis: p.zemis, art: 'Sprachkompetenz A1', datum: '01.06.2025', kohorte: 2024 });
    const res = fx.run();
    const r = g(res, p.knr).goals[1]!;
    expect(r.status).toBe('reached');
    expect(r.source).toBe('proven');
    expect(res.alerts.some((a) => a.code === 'proven_not_reproduced' && a.severity === 'info')).toBe(true);
    expect(g(res, p.knr).kohorte).toBe(2024);
  });
  it('T1-13 A2 fide without proven row -> reached (computed) + reached_not_recorded', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.01.2024' });
    lang(fx, p, 'A2', 'Zertifikat fide', '01.05.2025');
    const res = fx.run();
    const r = g(res, p.knr).goals[1]!;
    expect(r.status).toBe('reached');
    expect(r.source).toBe('computed');
    expect(res.alerts.some((a) => a.code === 'reached_not_recorded' && a.severity === 'high' && a.personId === p.knr)).toBe(true);
  });
  it('T1-14 French certificate -> not reached (German only)', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.01.2025' });
    lang(fx, p, 'A1', 'Zertifikat telc', '01.05.2025', 'Französisch');
    expect(g(fx.run(), p.knr).goals[1]!.status).toBe('on_track');
  });
  it('configurable: French counts when added to languages_counting', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.01.2025' });
    lang(fx, p, 'A1', 'Zertifikat telc', '01.05.2025', 'Französisch');
    const rules = defaultRules();
    rules.goal1.languages_counting.push('Französisch');
    expect(g(fx.run(rules), p.knr).goals[1]!.status).toBe('reached');
  });
  it('window setting: 3 months makes Amina on track', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '12.03.2024' });
    const rules = defaultRules();
    rules.at_risk_window_months = 3;
    expect(g(fx.run(rules), p.knr).goals[1]!.status).toBe('on_track');
  });
  it('Swiss schooling proof counts (Sara)', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.06.2024', status: 'B-FL', birth: '01.03.2009' });
    lang(fx, p, 'A2', 'Schulbildung CH', '30.06.2025');
    expect(g(fx.run(), p.knr).goals[1]!.status).toBe('reached');
  });
});

describe('Totals', () => {
  it('per social worker and per entry year reconcile with person rows', () => {
    const fx = new Fx();
    const a = addPerson(fx, { entry: '01.01.2024', sw: 'S. Keller' });
    lang(fx, a, 'A1', 'Zertifikat fide', '01.06.2025');
    addPerson(fx, { entry: '01.01.2023', sw: 'M. Rossi' }); // deadline 01.01.2026 -> missed
    addPerson(fx, { entry: '01.03.2024', sw: 'M. Rossi' }); // deadline 01.03.2027 -> at risk
    addPerson(fx, { status: 'S', sw: 'M. Rossi' });
    const res = fx.run();
    const t = res.totals[1]!;
    expect(t.overall.counts).toMatchObject({ reached_on_time: 1, missed: 1, at_risk: 1, not_applicable: 1 });
    expect(t.overall.rate).toBeCloseTo(1 / 3);
    const sum = t.bySocialWorker.reduce((s, r) => s + r.total, 0);
    expect(sum).toBe(res.persons.length);
    expect(t.byEntryYear.map((r) => r.group)).toEqual(['2023', '2024']);
  });
});
