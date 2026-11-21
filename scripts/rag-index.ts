/* Builds the knowledge index for "Frag das Cockpit" (local RAG).
 * Sources: the challenge brief, the current rules (rules.default.yaml with its notes) and docs/WHAT_WE_BUILT.md.
 * No client data. Embeddings come from the local Ollama model nomic-embed-text; nothing leaves the computer.
 * Run: npx tsx scripts/rag-index.ts   (writes src/rag/index.json)
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const OLLAMA = 'http://localhost:11434';
const MODEL = 'nomic-embed-text';
const MAX = 900; // characters per chunk

interface Chunk {
  id: string;
  source: string; // shown as the citation
  title: string;
  text: string;
  v?: number[];
}

const chunks: Chunk[] = [];
const push = (source: string, title: string, text: string) => {
  const t = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length < 40) return;
  chunks.push({ id: `${source}#${chunks.length}`, source, title, text: t });
};

/** Split long text into ~MAX-character pieces at paragraph or line boundaries. */
function split(text: string): string[] {
  const parts: string[] = [];
  let cur = '';
  for (const para of text.split(/\n\s*\n|\n(?=- )/)) {
    if ((cur + '\n' + para).length > MAX && cur) {
      parts.push(cur);
      cur = '';
    }
    cur = cur ? `${cur}\n${para}` : para;
    while (cur.length > MAX * 1.6) {
      parts.push(cur.slice(0, MAX));
      cur = cur.slice(MAX);
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

// 1) Challenge brief (public challenge text from ASD). Pages 1-2 only: pages 3-4 are the data-model diagram,
//    whose column-name lists match every question and push the useful passages out.
const handover = path.join(os.homedir(), 'Desktop/Projects/integration-cockpit-handover/01_challenge/integration-cockpit-challenge-en.pdf');
if (fs.existsSync(handover)) {
  const txt = execFileSync('pdftotext', ['-layout', '-l', '2', handover, '-'], { encoding: 'utf8' })
    .split('\n')
    .map((l) => l.trim())
    .join('\n');
  for (const p of split(txt)) push('Brief (ASD challenge)', 'Integration Cockpit challenge', p);
} else console.warn('brief PDF not found, skipped');

// 2) Current rules: one chunk per top-level section, with the comments (they carry the reasons and sources).
const yaml = fs.readFileSync('src/config/rules.default.yaml', 'utf8');
let sec = 'header';
let buf: string[] = [];
const flush = () => {
  if (buf.length) for (const p of split(buf.join('\n'))) push('rules.yaml', `Regeln: ${sec}`, `Section ${sec} of rules.yaml (the rules the cockpit applies):\n${p}`);
  buf = [];
};
for (const line of yaml.split('\n')) {
  const m = line.match(/^([a-z_0-9]+):/);
  if (m) {
    flush();
    sec = m[1];
  }
  buf.push(line);
}
flush();

// 3) German help text (plain-language rules, for social workers) and 4) what we built (current behaviour, decisions)
function addMarkdown(file: string, source: string) {
  const md = fs.readFileSync(file, 'utf8');
  let title = source;
  let body: string[] = [];
  const flushMd = () => {
    if (body.join('').trim()) for (const p of split(body.join('\n'))) push(source, title, `${title}\n${p}`);
    body = [];
  };
  for (const line of md.split('\n')) {
    const h = line.match(/^#{2,4}\s+(.*)/);
    if (h) {
      flushMd();
      title = h[1].trim();
      continue;
    }
    if (/^#\s/.test(line)) continue;
    body.push(line);
  }
  flushMd();
}
addMarkdown('docs/HILFE.md', 'Hilfe (Regeln erklärt)');
addMarkdown('docs/WHAT_WE_BUILT.md', 'WHAT_WE_BUILT.md');

// Embed (nomic: "search_document:" prefix for documents, "search_query:" for questions)
async function embed(texts: string[]): Promise<number[][]> {
  const r = await fetch(`${OLLAMA}/api/embed`, { method: 'POST', body: JSON.stringify({ model: MODEL, input: texts.map((t) => `search_document: ${t}`) }) });
  if (!r.ok) throw new Error(`Ollama embed failed: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { embeddings: number[][] }).embeddings;
}

for (let i = 0; i < chunks.length; i += 16) {
  const batch = chunks.slice(i, i + 16);
  const vs = await embed(batch.map((c) => `${c.title}\n${c.text}`));
  batch.forEach((c, j) => (c.v = vs[j].map((x) => Math.round(x * 1e4) / 1e4)));
}

fs.mkdirSync('src/rag', { recursive: true });
fs.writeFileSync('src/rag/index.json', JSON.stringify({ model: MODEL, built: new Date().toISOString().slice(0, 16), chunks }));
const by = chunks.reduce<Record<string, number>>((m, c) => ((m[c.source] = (m[c.source] ?? 0) + 1), m), {});
console.log(`indexed ${chunks.length} chunks:`, by);
