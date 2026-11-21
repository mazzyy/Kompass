import { describe, expect, it } from 'vitest';
import { fmt } from '../src/engine/dates';
import { defaultRules } from '../src/engine/defaultRules';
import { TEMPLATE_VALUES } from '../src/engine/import/templateValues';
import { addPerson, Fx, g, job } from './fixtures';

// ORGANISERS Q9: the federal payment period is 5 or 7 years depending on the permit.
// ORGANISERS Q7: the 2027 rule (5 years for everyone) applies to people arriving from 01.01.2027.
describe('Payment period by permit (TZ)', () => {
  it('TZ-01 years per status match the "+5"/"+7" variants in the ASD status template', () => {
    const years = defaultRules().payment_period.years_by_status;
    const variants = TEMPLATE_VALUES['klient.Verfahrensstand'].filter((v) => /\+\d$/.test(v));
    const fromTemplate = Object.fromEntries(variants.map((v) => [v.replace(/\+\d$/, ''), Number(v.slice(-1))]));
    expect(years).toEqual(fromTemplate);
    expect(Object.keys(years).sort()).toEqual([...defaultRules().scope.statuses].sort());
  });

  it.each([
    ['VA', 7, '01.03.2027'],
    ['F-FL', 7, '01.03.2027'],
    ['B-RSFL', 7, '01.03.2027'],
    ['B-FL', 5, '01.03.2025'],
    ['B-SL', 5, '01.03.2025'],
  ])('TZ-02 %s entered 01.03.2020 -> %i years, ends %s', (status, years, end) => {
    const fx = new Fx();
    const p = addPerson(fx, { status, entry: '01.03.2020', ze: '31.12.2032' });
    const person = g(fx.run(), p.knr);
    expect(person.payYears).toBe(years);
    expect(fmt(person.payEnd)).toBe(end);
    expect(fmt(person.deadline)).toBe(end); // earlier than Zuständigkeitsende -> payment period wins
  });

  it('TZ-03 goal 2 deadline follows the period: a B-FL job finishing after 5 years is missed, the same job as VA is reached', () => {
    const run = (status: string) => {
      const fx = new Fx();
      const p = addPerson(fx, { status, entry: '01.03.2021', ze: '01.03.2028' });
      job(fx, p, '01.01.2026', 80, '31.10.2026'); // 6 months done by 30.06.2026, after B-FL's 5-year end 01.03.2026
      return g(fx.run(), p.knr).goals[2]!;
    };
    const bfl = run('B-FL');
    expect(fmt(bfl.deadline)).toBe('01.03.2026');
    expect(bfl.status).toBe('reached');
    expect(bfl.late).toBe(true);
    const va = run('VA');
    expect(fmt(va.deadline)).toBe('01.03.2028');
    expect(va.status).toBe('reached');
    expect(va.late).toBe(false);
  });

  it('TZ-04 earlier Zuständigkeitsende is kept as deadline; big differences show in Data quality', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'VA', entry: '01.03.2021', ze: '01.03.2027' });
    const res = fx.run();
    expect(fmt(g(res, p.knr).deadline)).toBe('01.03.2027');
    const a = res.alerts.find((x) => x.code === 'period_mismatch' && x.personId === p.knr)!;
    expect(a.msg.p).toMatchObject({ status: 'VA', years: 7, end: '01.03.2028', ze: '01.03.2027', deadline: '01.03.2027' });
  });

  it('TZ-05 no alert when Zuständigkeitsende matches the period within the tolerance', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'B-FL', entry: '01.03.2022', ze: '07.03.2027' });
    expect(fx.run().alerts.some((x) => x.code === 'period_mismatch' && x.personId === p.knr)).toBe(false);
  });

  it('TZ-06 2027 rule: a VA arriving 15.01.2027 gets 5 years, a VA arriving 31.12.2026 keeps 7', () => {
    const fx = new Fx();
    const late = addPerson(fx, { status: 'VA', entry: '15.01.2027', ze: '15.01.2034' });
    const early = addPerson(fx, { status: 'VA', entry: '31.12.2026', ze: '31.12.2033' });
    const res = fx.run();
    expect(g(res, late.knr).payYears).toBe(5);
    expect(g(res, late.knr).pay2027).toBe(true);
    expect(fmt(g(res, late.knr).deadline)).toBe('15.01.2032');
    expect(g(res, early.knr).payYears).toBe(7);
    expect(res.whatIf!.affected).toBe(0); // already part of the deadlines, nothing to simulate
  });

  it('TZ-07 "+7" status: payment period over, not counted for goals 1 and 2', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'VA+7', entry: '01.03.2018' });
    const r = g(fx.run(), p.knr);
    expect(r.payYears).toBeUndefined();
    expect(r.goals[2]!.reason.key).toBe('na.past_responsibility');
  });
});
