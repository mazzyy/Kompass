/* Runs the real engine on a sample-data month and prints totals + persona results.
 * Usage: npx tsx scripts/check.ts sample-data/2026-11 */
import fs from 'node:fs';
import path from 'node:path';
import { fmt } from '../src/engine/dates';
import { acceptSuggestion, analyzeFiles, parseTables, type SavedMappings } from '../src/engine/import/detect';
import { readWorkbook } from '../src/engine/import/read';
import { parseRules } from '../src/engine/rules';
import { resolveStichtag, run } from '../src/engine/run';

const dir = process.argv[2] ?? 'sample-data/2026-11';
const rules = parseRules(fs.readFileSync('src/config/rules.default.yaml', 'utf8'));
const raws = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith('.xlsx'))
  .map((f) => readWorkbook(new Uint8Array(fs.readFileSync(path.join(dir, f))), f));
let saved: SavedMappings = {};
let an = analyzeFiles(raws, saved);
for (const a of an) {
  console.log(`${a.fileName.padEnd(62)} -> ${String(a.table).padEnd(20)} ${a.status.padEnd(18)} rows ${a.rows} score ${a.score.toFixed(2)}`);
  for (const s of a.suggestions) {
    console.log(`   suggestion: "${s.fileHeader}" -> ${s.expectedHeader} (score ${s.score.toFixed(2)}, values ok: ${s.profileOk})`);
    saved = acceptSuggestion(saved, s);
  }
}
an = analyzeFiles(raws, saved);
const st = resolveStichtag(rules, an)!;
const res = run({ parsed: parseTables(raws, an), rules, stichtag: st });
console.log(`\nStichtag ${fmt(st)} · current clients ${res.persons.length} · households ${new Set(res.persons.map((p) => p.dossierNr)).size}`);
const t = res.totals[1]!;
const row = (r: typeof t.overall) =>
  `${r.group.padEnd(12)} total ${String(r.total).padStart(4)} | counted ${String(r.counted).padStart(4)} reached ${String(r.counts.reached_on_time).padStart(3)}+${String(r.counts.reached_late).padStart(2)} late | on_track ${String(r.counts.on_track).padStart(3)} | at_risk ${String(r.counts.at_risk).padStart(3)} | missed ${String(r.counts.missed).padStart(3)} | no_data ${r.counts.no_data} | n/a ${String(r.counts.not_applicable).padStart(3)} | rate ${r.rate === null ? '-' : (r.rate * 100).toFixed(0) + ' %'}`;
console.log('\nGoal 1');
console.log(row(t.overall));
t.bySocialWorker.forEach((r) => console.log(row(r)));
t.byEntryYear.forEach((r) => console.log(row(r)));
const counts: Record<string, number> = {};
for (const a of res.alerts) counts[a.code] = (counts[a.code] ?? 0) + 1;
console.log('\nAlerts', counts);
console.log('Notes', JSON.stringify(res.notes));
console.log('\nPersonas');
for (const k of ['10351', '10633', '10482', '10217', '10790', '10905']) {
  const p = res.persons.find((x) => x.klientNr === k);
  if (!p) {
    console.log(k, 'MISSING');
    continue;
  }
  const g1 = p.goals[1]!;
  console.log(`${k} ${p.displayName.padEnd(16)} ${p.status.padEnd(6)} G1 ${g1.status.padEnd(14)} deadline ${fmt(g1.deadline)} ${JSON.stringify(g1.reason)}`);
}
console.log('\nCall list S. Keller (top 10 of', res.callLists['S. Keller']?.length, ')');
for (const c of (res.callLists['S. Keller'] ?? []).slice(0, 10)) {
  const p = res.persons.find((x) => x.id === c.personId)!;
  console.log(`  cat ${c.category} ${p.displayName.padEnd(16)} ${fmt(c.keyDate).padEnd(10)} days ${c.daysLeft ?? ''} ${c.lead.key}`);
}
for (const sw of res.socialWorkers) console.log(`  ${sw}: ${res.persons.filter((p) => p.socialWorker === sw).length} clients, ${res.callLists[sw]?.length ?? 0} flagged`);
