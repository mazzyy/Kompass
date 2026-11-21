import { describe, expect, it } from 'vitest';
import { fmt } from '../src/engine/dates';
import { defaultRules } from '../src/engine/defaultRules';
import { employerSimilarity } from '../src/engine/goal2';
import { addPerson, course, Fx, g, job, lang, support } from './fixtures';

const FORMS = defaultRules().dq.legal_forms_to_strip;

describe('Goal 2 (T2)', () => {
  it('T2-01 Fatima: ZE 30.06.2027, 50 % since 01.08.2026 -> at risk, latest start 01.01.2027', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'F-FL', ze: '30.06.2027' });
    job(fx, p, '01.08.2026', 50);
    const r = g(fx.run(), p.knr).goals[2]!;
    expect(r.status).toBe('at_risk');
    expect(fmt(r.latestAction)).toBe('01.01.2027');
    expect(r.reason).toMatchObject({ key: 'g2.at_risk.parttime', p: { latest: '01.01.2027', days: 42, min: 60 } });
  });
  it('T2-02 40 % + 30 % overlapping from 01.01.2026 -> reached 30.06.2026; not with combine_jobs false', () => {
    const fx = new Fx();
    const p = addPerson(fx);
    job(fx, p, '01.01.2026', 40);
    job(fx, p, '01.01.2026', 30);
    const r = g(fx.run(), p.knr).goals[2]!;
    expect(r.status).toBe('reached');
    expect(fmt(r.reachedDate)).toBe('30.06.2026');
    const rules = defaultRules();
    rules.goal2.combine_jobs = false;
    expect(g(fx.run(rules), p.knr).goals[2]!.status).not.toBe('reached');
  });
  it('T2-03 Yonas: 80 % from 01.03.2025 -> reached 31.08.2025', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'B-FL' });
    job(fx, p, '01.03.2025', 80);
    expect(fmt(g(fx.run(), p.knr).goals[2]!.reachedDate)).toBe('31.08.2025');
  });
  it('T2-04 one-day gap breaks the run', () => {
    const fx = new Fx();
    const p = addPerson(fx);
    job(fx, p, '01.01.2026', 100, '31.03.2026');
    job(fx, p, '02.04.2026', 100, '30.06.2026');
    expect(g(fx.run(), p.knr).goals[2]!.status).not.toBe('reached');
  });
  it('T2-05 (organisers: counts on completion) Sek II 15.08.2026–31.07.2028 -> on track until completion', () => {
    const fx = new Fx();
    const p = addPerson(fx, { birth: '01.01.2008' });
    course(fx, p, 'Sek II', 'Lehre EBA', '15.08.2026', '31.07.2028');
    const r = g(fx.run(), p.knr).goals[2]!;
    expect(r.status).toBe('on_track');
    expect(r.reason).toMatchObject({ key: 'g2.on_track.education', p: { date: '31.07.2028' } });
    expect(fmt(r.latestAction)).toBe('31.07.2028');
    // the earlier default (counts from start) is still one setting away
    const rules = defaultRules();
    rules.goal2.education_counts_from = 'start';
    expect(fmt(g(fx.run(rules), p.knr).goals[2]!.reachedDate)).toBe('15.08.2026');
  });
  it('T2-05b completed Sek II -> reached on the completion date', () => {
    const fx = new Fx();
    const p = addPerson(fx, { birth: '01.01.2005' });
    course(fx, p, 'Sek II', 'Lehre EFZ', '01.08.2023', '30.06.2026');
    const r = g(fx.run(), p.knr).goals[2]!;
    expect(r.status).toBe('reached');
    expect(fmt(r.reachedDate)).toBe('30.06.2026');
  });
  it('T2-05c completion after the end of responsibility -> not on track via education', () => {
    const fx = new Fx();
    const p = addPerson(fx, { birth: '01.01.2005', ze: '30.06.2027' });
    course(fx, p, 'Sek II', 'Lehre EFZ', '01.08.2025', '31.07.2028');
    expect(g(fx.run(), p.knr).goals[2]!.reason.key).not.toBe('g2.on_track.education');
  });
  it('organisers Q4: volunteering / unpaid work never counts, exclusion shown in the trace', () => {
    for (const bem of ['Freiwilligenarbeit', 'freiwilliger Einsatz', 'unbezahltes Praktikum', 'ehrenamtlich']) {
      const fx = new Fx();
      const p = addPerson(fx);
      job(fx, p, '01.01.2025', 100, '31.12.2025', { bemerkungen: bem });
      const r = g(fx.run(), p.knr).goals[2]!;
      expect(r.status).not.toBe('reached');
      expect(r.trace.some((t) => t.rule === 'g2.excluded')).toBe(true);
    }
  });
  it('min_pensum 0 (if ASD confirms "contract matters"): any contract for 6 months counts, no job never does', () => {
    const rules = defaultRules();
    rules.goal2.min_pensum = 0;
    const fx = new Fx();
    const p = addPerson(fx);
    job(fx, p, '01.01.2026', 20, '31.08.2026');
    const q = addPerson(fx);
    expect(g(fx.run(rules), p.knr).goals[2]!.status).toBe('reached');
    expect(g(fx.run(rules), q.knr).goals[2]!.status).not.toBe('reached');
    expect(g(fx.run(), p.knr).goals[2]!.status).not.toBe('reached'); // default 60 % unchanged
  });
  it('T2-06 Beschäftigungsprogramm is excluded and shown in the trace', () => {
    const fx = new Fx();
    const p = addPerson(fx);
    job(fx, p, '01.01.2025', 100, '31.12.2025', { bemerkungen: 'Beschäftigungsprogramm' });
    const r = g(fx.run(), p.knr).goals[2]!;
    expect(r.status).not.toBe('reached');
    expect(r.trace.some((t) => t.rule === 'g2.excluded' && t.msg.p?.kw === 'Programm')).toBe(true);
  });
  it('T2-07 ZE 15.12.2026, no job -> missed', () => {
    const fx = new Fx();
    const p = addPerson(fx, { ze: '15.12.2026' });
    const r = g(fx.run(), p.knr).goals[2]!;
    expect(r.status).toBe('missed');
    expect(fmt(r.latestAction)).toBe('16.06.2026');
  });
  it('T2-08 Sara: Brückenangebot, ZE 14.06.2029 -> on track, transition in call list', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'B-FL', birth: '15.04.2009', ze: '14.06.2029', entry: '01.06.2024' });
    lang(fx, p, 'A2', 'Schulbildung CH', '30.06.2025');
    course(fx, p, 'Brückenangebot', 'BVS', '01.08.2026', '31.07.2027');
    const res = fx.run();
    expect(g(res, p.knr).goals[2]!.status).toBe('on_track');
    expect(res.callLists['S. Keller'].find((c) => c.personId === p.knr)!.category).toBe(4);
  });
  it('T2-09 60 % since 01.10.2026 -> on track in progress, completes 31.03.2027', () => {
    const fx = new Fx();
    const p = addPerson(fx, { ze: '30.06.2027' });
    job(fx, p, '01.10.2026', 60);
    const r = g(fx.run(), p.knr).goals[2]!;
    expect(r.status).toBe('on_track');
    expect(r.reason).toMatchObject({ key: 'g2.on_track.running', p: { date: '31.03.2027' } });
  });
  it('T2-10 selbstständig 100 % for 12 months -> reached', () => {
    const fx = new Fx();
    const p = addPerson(fx);
    job(fx, p, '01.01.2025', 100, '31.12.2025', { erwerbsstatus: 'selbstständig' });
    expect(g(fx.run(), p.knr).goals[2]!.status).toBe('reached');
  });
});

describe('Goal 3 (T3)', () => {
  it('T3-01 Reza: support again from 01.09.2026, head ZE 15.12.2027 -> at risk, must end by 15.12.2026', () => {
    const fx = new Fx();
    const p = addPerson(fx, { dossier: 'D12.4471', ze: '15.12.2027', zb: '01.10.2021' });
    fx.add('dossierperson', { dossierNr: 'D12.4471', klientNr: p.knr, zemis: p.zemis, von: '01.10.2021', rolle: 'Dossiermitglied', beziehung: 'Dossierträger/-in' });
    support(fx, 'D12.4471', 'Sozialhilfe', '01.10.2021', '31.01.2026');
    support(fx, 'D12.4471', 'Keine Unterstützung', '01.02.2026', '31.08.2026');
    support(fx, 'D12.4471', 'Sozialhilfe', '01.09.2026');
    const res = fx.run();
    const r = g(res, p.knr).goals[3]!;
    expect(r.status).toBe('at_risk');
    expect(r.reason).toMatchObject({ key: 'g3.at_risk', p: { date: '15.12.2026', days: 25 } });
  });
  it('T3-02 free since 01.10.2025 -> reached 30.09.2026', () => {
    const fx = new Fx();
    const p = addPerson(fx, { dossier: 'D12.1', zb: '01.01.2024' });
    support(fx, 'D12.1', 'Sozialhilfe', '01.01.2024', '30.09.2025');
    const r = g(fx.run(), p.knr).goals[3]!;
    expect(r.status).toBe('reached');
    expect(fmt(r.reachedDate)).toBe('30.09.2026');
  });
  it('T3-03 Nothilfe counts as support', () => {
    const fx = new Fx();
    const p = addPerson(fx, { dossier: 'D12.2', zb: '01.01.2026', ze: '31.12.2030' });
    support(fx, 'D12.2', 'Nothilfe', '01.01.2026');
    expect(g(fx.run(), p.knr).goals[3]!.reason.key).toBe('g3.on_track');
  });
  it('T3-04 all members status S -> not applicable', () => {
    const fx = new Fx();
    const p = addPerson(fx, { dossier: 'D12.3', status: 'S' });
    support(fx, 'D12.3', 'Sozialhilfe', '01.01.2024');
    expect(g(fx.run(), p.knr).goals[3]!.status).toBe('not_applicable');
  });
  it('T3-05 only Keine Unterstützung 2025 -> reached 31.12.2025', () => {
    const fx = new Fx();
    const p = addPerson(fx, { dossier: 'D12.4', zb: '01.01.2025' });
    support(fx, 'D12.4', 'Keine Unterstützung', '01.01.2025', '31.12.2025');
    expect(fmt(g(fx.run(), p.knr).goals[3]!.reachedDate)).toBe('31.12.2025');
  });
  it('T3-06 household of 4: goal 3 on every member, totals count 1 household', () => {
    const fx = new Fx();
    const ms = [0, 1, 2, 3].map((i) => addPerson(fx, { dossier: 'D12.5', zb: '01.01.2024', birth: i < 2 ? '01.01.1985' : '01.01.2015' }));
    ms.forEach((m, i) => fx.add('dossierperson', { dossierNr: 'D12.5', klientNr: m.knr, zemis: m.zemis, von: '01.01.2024', rolle: 'Dossiermitglied', beziehung: i === 0 ? 'Dossierträger/-in' : 'Tochter / Sohn' }));
    support(fx, 'D12.5', 'Sozialhilfe', '01.01.2024');
    const res = fx.run();
    for (const m of ms) expect(g(res, m.knr).goals[3]).toBeDefined();
    expect(res.totals[3]!.overall.total).toBe(1);
    expect(res.totals[3]!.unit).toBe('households');
  });
  it('T3-07 free since 01.02.2026, head ZE 31.12.2026 -> missed', () => {
    const fx = new Fx();
    const p = addPerson(fx, { dossier: 'D12.6', zb: '01.01.2024', ze: '31.12.2026' });
    support(fx, 'D12.6', 'Sozialhilfe', '01.01.2024', '31.01.2026');
    expect(g(fx.run(), p.knr).goals[3]!.status).toBe('missed');
  });
});

describe('Data quality (TD)', () => {
  it('TD-01 Adecco variants match', () => {
    expect(employerSimilarity('Adecco Hotel & Event Bern Personalberatung', 'Adecco', FORMS)).toBeGreaterThanOrEqual(0.8);
  });
  it('TD-02 ZEMIS job without Erwerb row -> alert', () => {
    const fx = new Fx();
    const p = addPerson(fx);
    fx.add('zemis', { zemis: p.zemis, klientNr: p.knr, von: '01.05.2026', betrieb: 'Gastro Aare GmbH' });
    expect(fx.run().alerts.some((a) => a.code === 'zemis_job_not_in_erwerb' && a.personId === p.knr)).toBe(true);
  });
  it('TD-03 "4 You Personal AG / Einsatzort ..." matches after normalisation, no alert', () => {
    expect(employerSimilarity('4 You Personal AG / Einsatzort Kanton Basel-Stadt, 5600 Lenzburg', '4 You Personal AG', FORMS)).toBe(1);
    const fx = new Fx();
    const p = addPerson(fx);
    job(fx, p, '01.08.2026', 80, undefined, { arbeitgeber: 'Adecco' });
    fx.add('zemis', { zemis: p.zemis, klientNr: p.knr, von: '04.08.2026', betrieb: 'Adecco Hotel & Event Bern Personalberatung' });
    expect(fx.run().alerts.some((a) => a.code === 'zemis_job_not_in_erwerb')).toBe(false);
  });
  it('TD-04 Erwerb Bis before Von -> invalid_period', () => {
    const fx = new Fx();
    const p = addPerson(fx);
    job(fx, p, '01.05.2026', 80, '01.04.2026');
    expect(fx.run().alerts.some((a) => a.code === 'invalid_period')).toBe(true);
  });
});

describe('Call list TC-01 (all goals)', () => {
  it('Reza -> Fatima -> Amina -> Yonas -> Mohammad -> Sara', () => {
    const fx = new Fx();
    const reza = addPerson(fx, { knr: '10351', dossier: 'D12.4471', ze: '15.12.2027', zb: '01.10.2021', entry: '15.12.2020' });
    lang(fx, reza, 'A1', 'Zertifikat fide', '14.06.2022');
    fx.add('dossierperson', { dossierNr: 'D12.4471', klientNr: reza.knr, zemis: reza.zemis, von: '01.10.2021', beziehung: 'Dossierträger/-in' });
    support(fx, 'D12.4471', 'Sozialhilfe', '01.10.2021', '31.01.2026');
    support(fx, 'D12.4471', 'Sozialhilfe', '01.09.2026');
    job(fx, reza, '01.09.2026', 40);
    const fatima = addPerson(fx, { knr: '10633', status: 'F-FL', ze: '30.06.2027', entry: '30.06.2020', dossier: 'D12.7001' });
    lang(fx, fatima, 'A1', 'Zertifikat telc', '15.03.2022');
    job(fx, fatima, '01.08.2026', 50);
    const amina = addPerson(fx, { knr: '10482', entry: '12.03.2024', ze: '12.03.2031', dossier: 'D12.7002' });
    course(fx, amina, 'Deutschkurs', 'Deutsch A1 Intensiv', '01.10.2025', '14.03.2026');
    const yonas = addPerson(fx, { knr: '10217', status: 'B-FL', entry: '02.10.2023', ze: '05.10.2028', dossier: 'D12.7003' });
    lang(fx, yonas, 'A1', 'Kursbestätigung', '20.09.2026');
    job(fx, yonas, '01.03.2025', 80);
    const moh = addPerson(fx, { knr: '10790', entry: '09.08.2025', ze: '09.08.2032', birth: '03.02.1974', dossier: 'D12.7004' });
    course(fx, moh, 'Alphabetisierung', 'Deutsch Alpha', '01.10.2025', '14.02.2026');
    const sara = addPerson(fx, { knr: '10905', status: 'B-FL', entry: '01.06.2024', ze: '14.06.2029', birth: '15.04.2009', dossier: 'D12.7005' });
    lang(fx, sara, 'A2', 'Schulbildung CH', '30.06.2025');
    course(fx, sara, 'Brückenangebot', 'BVS', '01.08.2026', '31.07.2027');
    for (const [d, z] of [['D12.7001', fatima], ['D12.7002', amina], ['D12.7003', yonas], ['D12.7004', moh], ['D12.7005', sara]] as const)
      support(fx, d, 'Sozialhilfe', '01.01.2024'), void z;
    const res = fx.run();
    expect(res.callLists['S. Keller'].map((c) => c.personId)).toEqual(['10351', '10633', '10482', '10217', '10790', '10905']);
    expect(res.callLists['S. Keller'][0].daysLeft).toBe(25);
    expect(res.callLists['S. Keller'][1].daysLeft).toBe(42);
  });
});
