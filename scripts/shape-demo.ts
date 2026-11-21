/* Synthetic data post-step for the demo story (documented in planted_effects.md):
 * S. Keller's planted personas Reza, Fatima, Amina should be her most urgent at-risk cases.
 * Other S. Keller households whose at-risk date is earlier than Amina's are handed to another
 * social worker in the synthetic Klient export. No result is forced: the engine still computes everything. */
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { d, type Day } from '../src/engine/dates';
import { acceptSuggestion, analyzeFiles, parseTables, type SavedMappings } from '../src/engine/import/detect';
import { readWorkbook } from '../src/engine/import/read';
import { TABLE_BY_ID } from '../src/engine/import/signatures';
import { parseRules } from '../src/engine/rules';
import { run } from '../src/engine/run';

const PERSONAS = new Set(['10217', '10351', '10633', '10482', '10790', '10905']);
const OTHERS = ['M. Rossi', 'L. Bühler', 'D. Meier'];
const rules = parseRules(fs.readFileSync('src/config/rules.default.yaml', 'utf8'));

function compute(month: string, st: Day) {
  const dir = path.join('sample-data', month);
  const raws = fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx')).map((f) => readWorkbook(new Uint8Array(fs.readFileSync(path.join(dir, f))), f));
  let saved: SavedMappings = {};
  for (const a of analyzeFiles(raws)) for (const s of a.suggestions) saved = acceptSuggestion(saved, s);
  return run({ parsed: parseTables(raws, analyzeFiles(raws, saved)), rules, stichtag: st });
}

async function reassign(dossiers: Map<string, string>) {
  for (const month of ['2026-10', '2026-11']) {
    const file = path.join('sample-data', month, TABLE_BY_ID.klient.file);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(file);
    const ws = wb.worksheets[0];
    const hdr = (ws.getRow(1).values as string[]).map(String);
    const cD = hdr.indexOf('Dossier-Nr.');
    const cS = hdr.indexOf('Fallführung (Sozialarbeiter:in)');
    ws.eachRow((row, i) => {
      if (i === 1) return;
      const to = dossiers.get(String(row.getCell(cD).value));
      if (to) row.getCell(cS).value = to;
    });
    await wb.xlsx.writeFile(file);
  }
  const tf = 'sample-data/labels/situationsanalyse_truth.json';
  const truth = JSON.parse(fs.readFileSync(tf, 'utf8')) as { dossier: string; socialWorker: string }[];
  for (const h of truth) if (dossiers.has(h.dossier)) h.socialWorker = dossiers.get(h.dossier)!;
  fs.writeFileSync(tf, JSON.stringify(truth, null, 1));
}

let moved = 0;
for (let round = 0; round < 5; round++) {
  const res = compute('2026-11', d('20.11.2026'));
  const list = res.callLists['S. Keller'] ?? [];
  const amina = list.find((c) => c.personId === '10482');
  if (!amina) break;
  const byId = new Map(res.persons.map((p) => [p.id, p]));
  const move = new Map<string, string>();
  for (const c of list) {
    if (c.category !== 1 || PERSONAS.has(c.personId) || (c.keyDate ?? 0) > amina.keyDate!) continue;
    const dn = byId.get(c.personId)!.dossierNr;
    // never move a planted persona's household
    if (res.persons.some((p) => p.dossierNr === dn && PERSONAS.has(p.klientNr))) continue;
    move.set(dn, OTHERS[move.size % OTHERS.length]);
  }
  if (!move.size) break;
  moved += move.size;
  await reassign(move);
}
fs.appendFileSync(
  'sample-data/planted_effects.md',
  `\n## Demo caseload shaping\n${moved} synthetic households of S. Keller whose at-risk date was earlier than Amina's were assigned to other social workers, so the planted personas Reza, Fatima and Amina are her most urgent at-risk cases. All statuses are still computed by the engine.\n`,
);
console.log(`moved ${moved} S. Keller households to other social workers`);
