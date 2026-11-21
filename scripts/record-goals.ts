/* Synthetic data post-step: ASD records goals 2 and 3 in Integrationszielerreichung once reached
 * (with a lag; 4 deliberately left out -> "reached but not recorded" demo). Run after generate.ts. */
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { addDays, d, toJsDate, type Day } from '../src/engine/dates';
import { acceptSuggestion, analyzeFiles, parseTables, type SavedMappings } from '../src/engine/import/detect';
import { readWorkbook } from '../src/engine/import/read';
import { TABLE_BY_ID } from '../src/engine/import/signatures';
import { parseRules } from '../src/engine/rules';
import { run } from '../src/engine/run';

const M1 = d('20.10.2026');
const M2 = d('20.11.2026');
const rules = parseRules(fs.readFileSync('src/config/rules.default.yaml', 'utf8'));
const dir = 'sample-data/2026-11';
const raws = fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx')).map((f) => readWorkbook(new Uint8Array(fs.readFileSync(path.join(dir, f))), f));
let saved: SavedMappings = {};
for (const a of analyzeFiles(raws)) for (const s of a.suggestions) saved = acceptSuggestion(saved, s);
const res = run({ parsed: parseTables(raws, analyzeFiles(raws, saved)), rules, stichtag: M2 });

let h = 7;
const rnd = () => ((h = (h * 48271) % 2147483647) / 2147483647);
const add: [string, string, Day, number][] = []; // zemis, art, date, kohorte
let skipped = 0;
const done = new Set<string>();
for (const p of res.persons) {
  for (const g of [2, 3] as const) {
    const r = p.goals[g];
    if (!r || r.status !== 'reached' || r.late || r.source !== 'computed' || r.reachedDate === undefined) continue;
    if (r.reachedDate > addDays(M2, -45)) continue; // not yet recorded (natural lag)
    if (g === 3 && !p.isHead) continue;
    const key = `${p.zemis}|${g}`;
    if (done.has(key)) continue;
    done.add(key);
    if (skipped < 4 && rnd() < 0.08) {
      skipped++;
      continue;
    }
    const date = addDays(r.reachedDate, Math.floor(rnd() * 40));
    add.push([p.zemis, g === 2 ? 'Aufnahme Ausbildung / Erwerbstätigkeit' : 'Finanzielle Unabhängigkeit', date, p.zBeginn ? new Date(p.zBeginn * 864e5).getUTCFullYear() : 2024]);
  }
}

async function append(month: string, st: Day) {
  const file = path.join('sample-data', month, TABLE_BY_ID.zielerreichung.file);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  // drop rows added by an earlier run of this script
  for (let i = ws.rowCount; i >= 2; i--) {
    const art = String(ws.getRow(i).getCell(2).value ?? '');
    if (art.startsWith('Aufnahme') || art.startsWith('Finanzielle') || art.startsWith('Erwerb') || art.startsWith('Wirtschaftliche')) ws.spliceRows(i, 1);
  }
  for (const [z, art, date, k] of add) if (date <= st) ws.addRow([z, art, toJsDate(date), 'Bern Stadt und Umgebung', k, 'FALSCH']);
  ws.getColumn(3).numFmt = 'dd.mm.yyyy';
  await wb.xlsx.writeFile(file);
}

await append('2026-10', M1);
await append('2026-11', M2);
console.log(`recorded ${add.length} goal-2/3 rows, ${skipped} deliberately not recorded`);
