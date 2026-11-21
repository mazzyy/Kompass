import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { analyzeFiles } from '../src/engine/import/detect';
import { readWorkbook } from '../src/engine/import/read';
import { TABLES } from '../src/engine/import/signatures';
import { addPerson, Fx, g, support } from './fixtures';

// ASD's templates (all 11). Header row must match our signatures exactly, in order.
const files = fs.readdirSync('templates').filter((f) => f.endsWith('.xlsx'));
const raws = files.map((f) => readWorkbook(new Uint8Array(fs.readFileSync(`templates/${f}`)), f));

describe('ASD templates', () => {
  it('11 templates are recognised as the right tables, columns ok', () => {
    const an = analyzeFiles(raws);
    expect(new Set(an.map((a) => a.table)).size).toBe(11);
    for (const a of an) expect([a.fileName, a.status]).toEqual([a.fileName, 'ok']);
  });
  it('signature headers equal the template headers byte for byte and in order', () => {
    const an = analyzeFiles(raws);
    for (const [i, a] of an.entries()) {
      const spec = TABLES.find((t) => t.id === a.table)!;
      expect(spec.provisional).toBe(false);
      expect(spec.columns.filter((c) => !c.extra).map((c) => c.header)).toEqual(raws[i].headers.map(String));
    }
  });
  it('no table is provisional any more', () => {
    expect(TABLES.filter((t) => t.provisional).map((t) => t.id)).toEqual([]);
  });
});

describe('Integrationszielerreichung template values map to the goals', () => {
  it('Sprachniveau A1 -> goal 1, Aufnahme Ausbildung / Erwerbstätigkeit -> goal 2, Finanzielle Unabhängigkeit -> goal 3; Grundpauschale and Status-S rows ignored', () => {
    const fx = new Fx();
    const p = addPerson(fx, { dossier: 'D12.8001', entry: '01.03.2021', ze: '01.03.2028', zb: '01.04.2021' });
    fx.add('dossierperson', { dossierNr: 'D12.8001', klientNr: p.knr, zemis: p.zemis, von: '01.04.2021', beziehung: 'Dossierträger/-in' });
    support(fx, 'D12.8001', 'Sozialhilfe', '01.04.2021', '31.12.2024');
    fx.add('zielerreichung', { zemis: p.zemis, art: 'Sprachniveau A1', datum: '01.06.2023', partner: 'Bern Stadt und Umgebung', kohorte: 2021, statusS: 'FALSCH ' });
    fx.add('zielerreichung', { zemis: p.zemis, art: 'Aufnahme Ausbildung / Erwerbstätigkeit', datum: '01.02.2025', partner: 'Bern Stadt und Umgebung', kohorte: 2021, statusS: 'FALSCH' });
    fx.add('zielerreichung', { zemis: p.zemis, art: 'Finanzielle Unabhängigkeit', datum: '05.01.2026', partner: 'Bern Stadt und Umgebung', kohorte: 2021, statusS: 'FALSCH' });
    fx.add('zielerreichung', { zemis: p.zemis, art: 'Grundpauschale Integration', datum: '01.05.2021', partner: 'Bern Stadt und Umgebung', kohorte: 2021 });
    const res = fx.run();
    const r = g(res, p.knr);
    expect(r.goals[1]!.status).toBe('reached');
    expect(r.goals[1]!.reason.key).toBe('g1.reached.proven');
    expect(r.goals[2]!.reason.key).toBe('g2.reached.proven');
    expect(r.goals[3]!.reason.key).toBe('g3.reached.proven');
    expect(res.alerts.some((a) => a.code === 'unknown_value')).toBe(false); // all four Art values are known
  });
  it('a row marked "Ziel mit Status S erreicht" = TRUE does not count', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.03.2021' });
    fx.add('zielerreichung', { zemis: p.zemis, art: 'Sprachniveau A1', datum: '01.06.2023', statusS: 'TRUE' });
    expect(g(fx.run(), p.knr).goals[1]!.reason.key).not.toBe('g1.reached.proven');
  });
});
