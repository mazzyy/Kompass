import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { defaultRulesText } from '../src/engine/defaultRules';
import { writeManagement, writeSocialWorker } from '../src/excel/write';
import { addPerson, Fx, lang } from './fixtures';

function sample() {
  const fx = new Fx();
  const a = addPerson(fx, { entry: '01.01.2024', sw: 'S. Keller', vorname: 'Amina', name: 'Tesfay' });
  lang(fx, a, 'A1', 'Zertifikat fide', '01.06.2025');
  addPerson(fx, { entry: '12.03.2024', sw: 'S. Keller' });
  addPerson(fx, { entry: '01.01.2022', sw: 'M. Rossi' });
  addPerson(fx, { status: 'S', sw: 'M. Rossi' });
  addPerson(fx, { entry: null, sw: 'M. Rossi' });
  return fx.run();
}

async function load(buf: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb;
}

describe('Excel output (TE)', () => {
  it('Claimable now: Abrechenbar sheet lists reached-but-not-recorded goals from our own rules', async () => {
    const res = sample();
    expect(res.claimable.length).toBe(res.alerts.filter((a) => a.code === 'reached_not_recorded').length);
    const wb = await load((await writeManagement(res, defaultRulesText)).buffer);
    expect(wb.getWorksheet('Abrechenbar')!.rowCount - 1).toBe(res.claimable.length);
    expect(res.claimable.length).toBeGreaterThan(0);
  });
  it('TE-01 management workbook: sheets, German headers, frozen header, autofilter, fills', async () => {
    const res = sample();
    const f = await writeManagement(res, defaultRulesText);
    expect(f.name).toBe('Cockpit_2026-11-20.xlsx');
    const wb = await load(f.buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Übersicht', 'Ziel1_Personen', 'Ziel2_Personen', 'Anrufliste', 'Abrechenbar', 'Muster', 'Datenqualität', 'Prognose', 'WhatIf_2027', 'Regeln', 'Lauf']);
    const ws = wb.getWorksheet('Ziel1_Personen')!;
    expect(ws.getRow(1).getCell(1).value).toBe('Klientennummer');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    expect(ws.autoFilter).toBeTruthy();
    expect(ws.rowCount).toBe(1 + res.persons.length);
    const statusCell = ws.getRow(2).getCell(10);
    expect(typeof statusCell.value).toBe('string');
    expect((statusCell.fill as ExcelJS.FillPattern).fgColor?.argb).toBeTruthy();
  });

  it('TE-02 per-social-worker workbook only contains their clients', async () => {
    const res = sample();
    const f = await writeSocialWorker(res, 'S. Keller', defaultRulesText);
    const wb = await load(f.buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(expect.arrayContaining(['Anrufliste', 'Meine_Klienten', 'Regeln']));
    const ws = wb.getWorksheet('Meine_Klienten')!;
    expect(ws.rowCount - 1).toBe(res.persons.filter((p) => p.socialWorker === 'S. Keller').length);
    const calls = wb.getWorksheet('Anrufliste')!;
    calls.eachRow((row, rn) => {
      if (rn > 1) expect(row.getCell(2).value).toBe('S. Keller');
    });
  });

  it('TE-03 totals reconcile with person rows', async () => {
    const res = sample();
    const wb = await load((await writeManagement(res, defaultRulesText)).buffer);
    const persons = wb.getWorksheet('Ziel1_Personen')!;
    const words: Record<string, number> = {};
    persons.eachRow((row, rn) => {
      if (rn > 1) words[String(row.getCell(10).value)] = (words[String(row.getCell(10).value)] ?? 0) + 1;
    });
    const t = res.totals[1]!.overall;
    expect(words['erreicht'] ?? 0).toBe(t.counts.reached_on_time);
    expect(words['nicht anwendbar'] ?? 0).toBe(t.counts.not_applicable);
    expect(words['nicht gezählt (Daten fehlen)'] ?? 0).toBe(t.counts.no_data);
    const ov = wb.getWorksheet('Übersicht')!;
    let ctl: ExcelJS.Row | undefined;
    ov.eachRow((row) => {
      if (String(row.getCell(1).value).startsWith('Kontrolle')) ctl = row;
    });
    expect(ctl).toBeDefined();
    const totalCell = ctl!.getCell(10).value as { result: number };
    expect(totalCell.result).toBe(res.persons.length);
  });

  it('TE-04 dates are real Excel dates formatted dd.mm.yyyy', async () => {
    const res = sample();
    const wb = await load((await writeManagement(res, defaultRulesText)).buffer);
    const ws = wb.getWorksheet('Ziel1_Personen')!;
    const c = ws.getRow(2).getCell(9);
    expect(c.value).toBeInstanceOf(Date);
    expect(c.numFmt).toBe('dd.mm.yyyy');
  });
});
