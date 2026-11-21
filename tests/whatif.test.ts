import { describe, expect, it } from 'vitest';
import { fmt } from '../src/engine/dates';
import { defaultRules } from '../src/engine/defaultRules';
import { addPerson, Fx, job, support } from './fixtures';

describe('What-if 2027 (TW)', () => {
  it('TW-01 VA, entry 01.03.2021, ZE 01.03.2028 -> A: new ZE 01.01.2027', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.03.2021', ze: '01.03.2028' });
    const c = fx.run().whatIf!.changes.find((x) => x.personId === p.knr)!;
    expect(fmt(c.newEnd)).toBe('01.01.2027');
  });
  it('TW-02 VA, entry 01.06.2024, ZE 01.06.2031 -> A: new ZE 01.06.2029', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.06.2024', ze: '01.06.2031' });
    expect(fmt(fx.run().whatIf!.changes.find((x) => x.personId === p.knr)!.newEnd)).toBe('01.06.2029');
  });
  it('TW-03 B-FL client unchanged', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'B-FL', entry: '01.03.2021', ze: '01.03.2026' });
    addPerson(fx, { status: 'B-FL', entry: '01.06.2023', ze: '01.06.2028' });
    expect(fx.run().whatIf!.changes.find((x) => x.personId === p.knr)).toBeUndefined();
  });
  it('TW-04 interpretation B: entries before 2027 unchanged', () => {
    const fx = new Fx();
    addPerson(fx, { entry: '01.03.2021', ze: '01.03.2028' });
    const rules = defaultRules();
    rules.whatif_2027.interpretation = 'B';
    expect(fx.run(rules).whatIf!.affected).toBe(0);
  });
  it('TW-05 delta per status for goals 2 and 3 (Fatima and Reza lose their window), goal 1 unchanged', () => {
    const fx = new Fx();
    const fatima = addPerson(fx, { status: 'F-FL', entry: '30.06.2020', ze: '30.06.2027', dossier: 'D12.9001' });
    job(fx, fatima, '01.08.2026', 50);
    support(fx, 'D12.9001', 'Sozialhilfe', '01.01.2024');
    const reza = addPerson(fx, { entry: '15.12.2020', ze: '15.12.2027', dossier: 'D12.4471', zb: '01.10.2021' });
    fx.add('dossierperson', { dossierNr: 'D12.4471', klientNr: reza.knr, zemis: reza.zemis, von: '01.10.2021', beziehung: 'Dossierträger/-in' });
    support(fx, 'D12.4471', 'Sozialhilfe', '01.10.2021', '31.01.2026');
    support(fx, 'D12.4471', 'Sozialhilfe', '01.09.2026');
    const res = fx.run();
    const w = res.whatIf!;
    const f = w.changes.find((c) => c.personId === fatima.knr)!;
    expect(f.before[2]).toBe('at_risk');
    expect(f.after[2]).toBe('missed');
    const r = w.changes.find((c) => c.personId === reza.knr)!;
    expect(r.before[3]).toBe('at_risk');
    expect(r.after[3]).toBe('missed');
    expect(w.delta[2].missed).toBeGreaterThanOrEqual(1);
    expect(w.delta[3].missed).toBeGreaterThanOrEqual(1);
    expect(Object.keys(w.delta)).toEqual(['2', '3']);
  });
});
