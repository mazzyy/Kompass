/* Runs the LOCAL model (Ollama) over Situationsanalyse reports, caches results, measures accuracy.
 * npx tsx scripts/extract.ts amina            -> one report, printed
 * npx tsx scripts/extract.ts accuracy 20      -> 20 reports (fixed sample), accuracy vs labels
 * npx tsx scripts/extract.ts cache            -> S. Keller + new-this-month reports into the cache
 */
import fs from 'node:fs';
import path from 'node:path';
import { extractReport, fieldCorrect, SA_FIELDS, type ReportExtraction, type SaFieldId } from '../src/ai/extract';

const DIR = 'sample-data/2026-11/situationsanalyse';
const CACHE = path.join(DIR, 'extractions.json');
const endpoint = process.env.OLLAMA ?? 'http://localhost:11434';
const model = process.env.MODEL ?? 'qwen2.5:7b-instruct';
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8')) as { file: string; dossier: string; socialWorker: string; newThisMonth: boolean; persona: string | null }[];
const truth = JSON.parse(fs.readFileSync('sample-data/labels/report_truth.json', 'utf8')) as Record<string, { persons: Record<string, Record<string, unknown>> }>;
const cache: Record<string, ReportExtraction> = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : {};
const save = () => fs.writeFileSync(CACHE, JSON.stringify(cache, null, 1));

const human = fs.existsSync('sample-data/labels/human_truth.json') ? JSON.parse(fs.readFileSync('sample-data/labels/human_truth.json', 'utf8')) : {};

async function runOne(file: string, force = false) {
  if (!force && cache[file]?.model === model) return cache[file];
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  const r = await extractReport(file, text, { endpoint, model });
  cache[file] = r;
  save();
  return r;
}

async function main() {
  const mode = process.argv[2] ?? 'amina';
  if (mode === 'amina') {
    const f = index.find((x) => x.persona === 'amina')!.file;
    const r = await runOne(f, true);
    for (const p of r.persons) {
      console.log(`\n${p.name} (${p.zemis}) ${p.ms} ms`);
      for (const fd of SA_FIELDS) {
        const e = p.fields[fd.id];
        const want = truth[f]?.persons[p.zemis]?.[fd.id];
        console.log(`  ${fieldCorrect(fd.id, e, want) ? 'OK ' : 'XX '} ${fd.id.padEnd(36)} ${e.status.padEnd(10)} ${String(e.value).padEnd(24)} want=${want} | ${e.evidence}`);
      }
    }
    return;
  }
  let files: string[] = [];
  if (mode === 'accuracy') {
    const n = Number(process.argv[3] ?? 20);
    // fixed, reproducible sample: every k-th report, personas and new ones excluded (those are demo reports)
    const pool = index.filter((x) => !x.persona && !x.newThisMonth);
    const k = Math.max(1, Math.floor(pool.length / n));
    files = pool.filter((_, i) => i % k === 0).slice(0, n).map((x) => x.file);
  } else if (mode === 'human') {
    // Only reports a person actually wrote and marked as such (guards against measuring the generated drafts).
    files = Object.entries(human)
      .filter(([k, v]) => !k.startsWith('_') && (v as { written_by_human?: boolean }).written_by_human === true)
      .map(([k]) => k);
    if (!files.length) {
      console.error('No report marked "written_by_human": true in sample-data/labels/human_truth.json. Nothing measured.');
      process.exit(1);
    }
  } else if (mode === 'cache') {
    files = index.filter((x) => x.persona || x.newThisMonth || x.socialWorker === 'S. Keller').map((x) => x.file);
  } else files = [mode];
  const t0 = Date.now();
  let done = 0;
  for (const f of files) {
    await runOne(f, mode === 'human'); // hand-written reports may have changed: always re-read
    done++;
    if (done % 5 === 0) console.log(`${done}/${files.length} reports, ${Math.round((Date.now() - t0) / 1000)} s`);
  }
  if (mode === 'accuracy' || mode === 'human') {
    const labels = mode === 'human' ? human : truth;
    let ok = 0;
    let total = 0;
    let stated = 0;
    let evOk = 0;
    const perField: Record<string, [number, number]> = {};
    for (const f of files) {
      for (const p of cache[f].persons) {
        const want = labels[f]?.persons[p.zemis];
        if (!want) continue;
        for (const fd of SA_FIELDS) {
          const c = fieldCorrect(fd.id as SaFieldId, p.fields[fd.id], want[fd.id]);
          total++;
          if (c) ok++;
          perField[fd.id] ??= [0, 0];
          perField[fd.id][1]++;
          if (c) perField[fd.id][0]++;
          if (p.fields[fd.id].status !== 'not_stated') {
            stated++;
            if (p.fields[fd.id].status === 'stated') evOk++;
          }
        }
      }
    }
    const acc = {
      model,
      measuredAt: new Date().toISOString(),
      reports: files.length,
      persons: files.reduce((s, f) => s + cache[f].persons.length, 0),
      fields: total,
      correct: ok,
      accuracy: ok / total,
      evidenceFoundRate: stated ? evOk / stated : null,
      perField: Object.fromEntries(Object.entries(perField).map(([k, [a, b]]) => [k, a / b])),
      note: mode === 'human' ? 'Reports hand-written by a person, labelled by the writer.' : 'Synthetic reports drafted from generator ground truth.',
    };
    fs.writeFileSync(path.join(DIR, mode === 'human' ? 'accuracy_human.json' : 'accuracy.json'), JSON.stringify(acc, null, 1));
    console.log(acc);
  }
  console.log(`done: ${files.length} reports in ${Math.round((Date.now() - t0) / 1000)} s`);
}

main();
