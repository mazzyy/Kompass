/* Prints the numbers used to compare rule changes: totals per goal, claimable, S. Keller call list. */
import fs from 'node:fs';
import path from 'node:path';
import { fmt } from '../src/engine/dates';
import { acceptSuggestion, analyzeFiles, parseTables, type SavedMappings } from '../src/engine/import/detect';
import { readWorkbook } from '../src/engine/import/read';
import { parseRules } from '../src/engine/rules';
import { resolveStichtag, run } from '../src/engine/run';

const dir = process.argv[2] ?? 'sample-data/2026-11';
const rules = parseRules(fs.readFileSync('src/config/rules.default.yaml', 'utf8'));
const raws = fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx')).map((f) => readWorkbook(new Uint8Array(fs.readFileSync(path.join(dir, f))), f));
let saved: SavedMappings = {};
for (const a of analyzeFiles(raws)) for (const s of a.suggestions) saved = acceptSuggestion(saved, s);
const an = analyzeFiles(raws, saved);
const res = run({ parsed: parseTables(raws, an), rules, stichtag: resolveStichtag(rules, an)! });
const out: Record<string, unknown> = {};
for (const g of res.computedGoals) {
  const o = res.totals[g]!.overall;
  out[`goal${g}`] = { counted: o.counted, reached: o.reached, late: o.counts.reached_late, on_track: o.counts.on_track, at_risk: o.counts.at_risk, missed: o.counts.missed, no_data: o.counts.no_data, na: o.counts.not_applicable };
}
out.claimable = { total: res.claimable.length, g1: res.claimable.filter((c) => c.goal === 1).length, g2: res.claimable.filter((c) => c.goal === 2).length, g3: res.claimable.filter((c) => c.goal === 3).length };
out.proven_not_reproduced = res.alerts.filter((a) => a.code === 'proven_not_reproduced').map((a) => `g${a.goal}`).join(',');
const byId = new Map(res.persons.map((p) => [p.id, p]));
out.keller = (res.callLists['S. Keller'] ?? []).slice(0, 12).map((c, i) => `${i + 1}. ${byId.get(c.personId)!.displayName} (${c.personId}) cat${c.category} ${fmt(c.keyDate)} ${c.lead.key}`);
out.kellerTotal = res.callLists['S. Keller']?.length;
out.personas = ['10351', '10633', '10482', '10217', '10790', '10905'].map((k) => {
  const p = byId.get(k)!;
  return `${p.displayName}: G1 ${p.goals[1]?.status} · G2 ${p.goals[2]?.status} (${p.goals[2]?.reason.key}) · G3 ${p.goals[3]?.status}`;
});
console.log(JSON.stringify(out, null, 1));
