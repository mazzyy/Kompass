import { describe, expect, it } from 'vitest';
import { defaultRules } from '../src/engine/defaultRules';
import { parseRules } from '../src/engine/rules';
import { defaultRulesText } from '../src/engine/defaultRules';
import { addPerson, course, Fx, lang } from './fixtures';

describe('Call list (TC)', () => {
  it('TC-01 (goal-1 part): Amina -> Yonas -> Mohammad -> Sara', () => {
    const fx = new Fx();
    const sara = addPerson(fx, { knr: '10905', entry: '01.06.2024', status: 'B-FL', birth: '15.04.2009', ze: '14.06.2029' });
    lang(fx, sara, 'A2', 'Schulbildung CH', '30.06.2025');
    course(fx, sara, 'Brückenangebot', 'Berufsvorbereitendes Schuljahr', '01.08.2026', '31.07.2027', 28);
    const moh = addPerson(fx, { knr: '10790', entry: '09.08.2025', birth: '03.02.1974' });
    lang(fx, moh, 'A0', 'Einstufung', '20.09.2025');
    course(fx, moh, 'Deutschkurs', 'Deutsch Alpha', '01.10.2025', '14.02.2026');
    const yonas = addPerson(fx, { knr: '10217', entry: '02.10.2023', status: 'B-FL', birth: '11.07.1997', ze: '05.10.2028' });
    lang(fx, yonas, 'A1', 'Kursbestätigung', '20.09.2026');
    fx.add('erwerb', { zemis: yonas.zemis, klientNr: yonas.knr, von: '01.03.2025', arbeitgeber: 'Logistik AG', pensum: 80, erwerbsstatus: 'unselbstständig' });
    const amina = addPerson(fx, { knr: '10482', entry: '12.03.2024', birth: '05.05.1992' });
    lang(fx, amina, 'A0', 'Einstufung', '03.05.2024');
    course(fx, amina, 'Deutschkurs', 'Deutsch A1 Intensiv', '01.10.2025', '14.03.2026');
    // someone of another social worker never shows up in S. Keller's list (TC-03 engine side)
    addPerson(fx, { knr: '19999', entry: '01.01.2024', sw: 'M. Rossi' });
    const res = fx.run();
    const list = res.callLists['S. Keller'].map((c) => c.personId);
    expect(list).toEqual(['10482', '10217', '10790', '10905']);
    const items = res.callLists['S. Keller'];
    expect(items[0]).toMatchObject({ category: 1, daysLeft: 112 });
    expect(items[1].category).toBe(2);
    expect(items[3].lead).toEqual({ key: 'call.transition', p: { what: 'Berufsvorbereitendes Schuljahr', date: '31.07.2027', days: 253 } });
    expect(res.callLists['M. Rossi'].map((c) => c.personId)).toEqual(['19999']);
  });

  it('TC-02 rank_by_payout can never be set true', () => {
    const r = parseRules(defaultRulesText.replace('rank_by_payout: false', 'rank_by_payout: true'));
    expect(r.calls.rank_by_payout).toBe(false);
    expect(defaultRules().calls.rank_by_payout).toBe(false);
  });
});
