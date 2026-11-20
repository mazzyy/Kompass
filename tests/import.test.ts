import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { d, fmt, parseDate } from '../src/engine/dates';
import { defaultRules } from '../src/engine/defaultRules';
import { acceptSuggestion, analyzeFiles, normKey, parseTables, runBlocked, type RawTable } from '../src/engine/import/detect';
import { readWorkbook } from '../src/engine/import/read';
import { TABLE_BY_ID } from '../src/engine/import/signatures';
import { run } from '../src/engine/run';
import { addPerson, Fx, g, lang, ST } from './fixtures';

describe('Import (TI)', () => {
  it('TI-01 text, Excel serial and short dates all parse to 2025-03-05', () => {
    const want = d('05.03.2025');
    expect(parseDate('05.03.2025')).toBe(want);
    expect(parseDate(45721)).toBe(want); // Excel serial for 05.03.2025
    expect(parseDate('5.3.25')).toBe(want);
    expect(parseDate('5.3.2025')).toBe(want);
    expect(parseDate('')).toBeUndefined();
    expect(fmt(want)).toBe('05.03.2025');
  });

  it('TI-02 tables are identified by header row, not file name', () => {
    const fx = new Fx();
    addPerson(fx);
    const raws = fx.raws().map((r, i) => ({ ...r, fileName: `export_${i}_random.xlsx` }));
    const an = analyzeFiles(raws);
    expect(an.map((a) => a.table).sort()).toEqual(['asylgeschaeftsdaten', 'erwerb', 'foerderung', 'klient', 'sprachstand', 'zielerreichung'].sort());
    expect(an.every((a) => a.status === 'ok')).toBe(true);
  });

  it('all 11 signatures are distinguishable from each other', () => {
    const raws: RawTable[] = Object.values(TABLE_BY_ID).map((s) => ({
      fileName: 'x.xlsx',
      sheetName: 'Tabelle1',
      headers: s.columns.map((c) => c.header),
      rows: [],
    }));
    const an = analyzeFiles(raws);
    expect(an.map((a) => a.table)).toEqual(Object.keys(TABLE_BY_ID));
  });

  it('TI-03 renamed Sprachstand header: suggestion, run blocked, mapping remembered', () => {
    const fx = new Fx();
    const p = addPerson(fx, { entry: '01.01.2024' });
    lang(fx, p, 'A1', 'Zertifikat fide', '01.06.2025');
    const raws = fx.raws();
    const sp = raws.find((r) => r.headers.includes('Sprachniveau'))!;
    sp.headers = sp.headers.map((h) => (h === 'Sprachniveau' ? 'Niveau (A0–C2)' : h));
    let an = analyzeFiles(raws);
    const a = an.find((x) => x.table === 'sprachstand')!;
    expect(a.status).toBe('needs_confirmation');
    expect(a.suggestions[0]).toMatchObject({ colKey: 'niveau', fileHeader: 'Niveau (A0–C2)', profileOk: true });
    expect(runBlocked(an)).toBe(true);
    const saved = acceptSuggestion({}, a.suggestions[0]);
    an = analyzeFiles(raws, saved);
    expect(runBlocked(an)).toBe(false);
    expect(an.find((x) => x.table === 'sprachstand')!.status).toBe('mapped');
    const res = run({ parsed: parseTables(raws, an), rules: defaultRules(), stichtag: ST });
    expect(g(res, p.knr).goals[1]!.status).toBe('reached');
  });

  it('TI-04 unknown status value VA* -> unknown_value alert, person not applicable "unknown status"', () => {
    const fx = new Fx();
    const p = addPerson(fx, { status: 'VA*' });
    const res = fx.run();
    expect(res.alerts.some((a) => a.code === 'unknown_value' && a.msg.p?.value === 'VA*')).toBe(true);
    expect(g(res, p.knr).goals[1]!.reason.key).toBe('na.unknown_status');
  });

  it('TI-05 Sprachstand missing -> clear note, goal 1 not computed', () => {
    const fx = new Fx();
    addPerson(fx);
    delete fx.t.sprachstand;
    const res = fx.run();
    expect(res.computedGoals).not.toContain(1);
    expect(res.notes).toContainEqual({ key: 'note.no_goal1_sprachstand' });
    expect(res.missingTables).toContain('sprachstand');
  });

  it('TI-06 same input twice -> identical result', () => {
    const fx = new Fx();
    for (let i = 0; i < 5; i++) addPerson(fx, { entry: `01.0${i + 1}.2024` });
    expect(JSON.stringify(fx.run())).toBe(JSON.stringify(fx.run()));
  });

  it('TI-07 headers with trailing spaces, other case, NBSP still match', () => {
    const fx = new Fx();
    addPerson(fx);
    const raws = fx.raws();
    for (const r of raws) r.headers = r.headers.map((h) => ` ${String(h).toUpperCase().replace(/ /g, ' ')}  `);
    const an = analyzeFiles(raws);
    expect(an.every((a) => a.status === 'ok')).toBe(true);
  });

  it("TI-08 ZEMIS as '12345678 text and as number join", () => {
    expect(normKey("'12345678")).toBe('12345678');
    expect(normKey(12345678)).toBe('12345678');
    expect(normKey(' 12345678 ')).toBe('12345678');
    const fx = new Fx();
    const p = addPerson(fx, { zemis: '12345678', entry: '01.01.2024' });
    fx.t.klient![0].zemis = "'12345678";
    fx.add('sprachstand', { zemis: 12345678, klientNr: p.knr, sprache: 'Deutsch', niveau: 'A1', art: 'Zertifikat telc', datum: '01.06.2025' });
    expect(g(fx.run(), p.knr).goals[1]!.status).toBe('reached');
  });

  it('reads a real .xlsx (Excel dates + text dates) via SheetJS', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Tabelle1');
    ws.addRow(['Klient/-in Zemis-Nr.', 'Klientennummer', 'Asylgeschäftsart', 'Ereignisdatum', 'Erledigung', 'Erledigungscode', 'Erledigungsdatum']);
    ws.addRow([12345678, 12345, 'Aufenthalt (Einreise)', new Date(Date.UTC(2025, 2, 5)), null, null, '05.03.2025']);
    ws.getCell('D2').numFmt = 'dd.mm.yyyy';
    const buf = await wb.xlsx.writeBuffer();
    const raw = readWorkbook(new Uint8Array(buf as ArrayBuffer), 'a.xlsx');
    const an = analyzeFiles([raw]);
    expect(an[0].table).toBe('asylgeschaeftsdaten');
    const parsed = parseTables([raw], an);
    const rec = parsed.tables.asylgeschaeftsdaten![0];
    expect(fmt(rec.datum as number)).toBe('05.03.2025');
    expect(fmt(rec.erledigungsdatum as number)).toBe('05.03.2025');
    expect(rec.zemis).toBe('12345678');
    expect(rec._row).toBe(2);
  });
});
