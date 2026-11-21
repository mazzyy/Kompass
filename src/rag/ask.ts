// "Frag das Cockpit": local retrieval-augmented answers.
// Retrieval over a prebuilt index (brief, rules.yaml, WHAT_WE_BUILT.md; no client data), embedded with the
// local Ollama model. The answer is written by the local model from those passages plus this month's
// totals (no names). Nothing leaves the computer.
import INDEX from './index.json';

export interface Passage {
  id: string;
  source: string;
  title: string;
  text: string;
  score: number;
}

interface IndexChunk {
  id: string;
  source: string;
  title: string;
  text: string;
  v: number[];
}
const chunks = (INDEX as unknown as { chunks: IndexChunk[] }).chunks;

const norm = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
const norms = chunks.map((c) => norm(c.v));

const STOP = new Set(
  'und oder der die das den dem des ein eine einer eines ist sind wird werden warum wieso was wer wie wann wo ab für fuer mit von vom zum zur auf aus bei nicht nur auch noch schon dass als bis nach über ueber the and for with from what when why how who which does not are is was this that into have has can our their'.split(' '),
);
const words = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9%+]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));

// Inverse document frequency: rare words (e.g. "Praktikum") count more than common ones (e.g. "Ziel").
const chunkWords = chunks.map((c) => new Set(words(`${c.title} ${c.text}`)));
const df = new Map<string, number>();
for (const ws of chunkWords) for (const w of ws) df.set(w, (df.get(w) ?? 0) + 1);
const idf = (w: string) => Math.log(1 + chunks.length / (1 + (df.get(w) ?? 0)));

/** Keyword score (0..1), used to mix with the embedding score and as the fallback when the model is offline. */
function keyword(q: string, i: number): number {
  const qw = [...new Set(words(q))];
  if (!qw.length) return 0;
  const tw = chunkWords[i];
  let hit = 0;
  let all = 0;
  for (const w of qw) {
    const wt = idf(w);
    all += wt;
    // same word, or same stem (first 6 letters, e.g. Praktikum / Praktika)
    if (tw.has(w) || (w.length >= 6 && [...tw].some((t) => t.length >= 6 && t.slice(0, 6) === w.slice(0, 6)))) hit += wt;
  }
  return all ? hit / all : 0;
}

export async function embedQuery(q: string, endpoint: string, model: string): Promise<number[]> {
  const r = await fetch(`${endpoint}/api/embed`, { method: 'POST', body: JSON.stringify({ model, input: [`search_query: ${q}`], keep_alive: '30m' }) });
  if (!r.ok) throw new Error(`embed ${r.status}`);
  return ((await r.json()) as { embeddings: number[][] }).embeddings[0];
}

/** Top passages for a question. With an embedding: 0.7 meaning + 0.3 keywords; without: keywords only. */
export function retrieve(q: string, qv: number[] | undefined, k = 5): Passage[] {
  const qn = qv ? norm(qv) : 1;
  return chunks
    .map((c, i) => {
      const kw = keyword(q, i);
      const cos = qv ? c.v.reduce((s, x, j) => s + x * qv[j], 0) / (norms[i] * qn) : 0;
      return { id: c.id, source: c.source, title: c.title, text: c.text, score: qv ? 0.7 * cos + 0.3 * kw : kw };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function buildMessages(lang: 'de' | 'en', question: string, passages: Passage[], totals: string, history: { q: string; a: string }[] = [], charts = '') {
  const de = lang === 'de'
  const sys = de
    ? 'Du bist der Hilfe-Assistent im Integrations-Cockpit des Asylsozialdienstes der Stadt Bern. Du erklärst Regeln und Zahlen in ganzen, klaren Sätzen auf Deutsch. Du stützt dich nur auf die Quellen und Kennzahlen, die du bekommst. Du bewertest keine einzelnen Personen und machst keine Prognosen für Einzelpersonen: Die Ampeln setzen die Regeln.'
    : "You are the help assistant in the Integration Cockpit of the City of Bern's asylum social service. You explain rules and figures in full, clear English sentences. You rely only on the sources and figures you are given. You do not judge individual people or predict for individuals: the rules set the traffic lights."
  const ctx = passages.map((p, i) => `[${i + 1}] (${p.source} · ${p.title})\n${p.text}`).join('\n\n')
  const task = de
    ? `Beantworte jetzt die Frage in 2 bis 5 ganzen Sätzen. Setze die Nummer der Quelle in eckigen Klammern ans Ende des Satzes, so: «Aussage [2].» Wiederhole keine Beispiele, beantworte nur diese Frage. Für Zahlen aus den Kennzahlen schreibe [K] und übernimm die Zahlen genau, ohne selbst zu rechnen. Steht die Antwort nicht in den Quellen, schreibe: «Dazu finde ich in den Unterlagen nichts.» Bei Fragen zu einer einzelnen Person: verweise auf ihre Seite im Cockpit.`
    : `Now answer the question in 2 to 5 full sentences. Put the source number in square brackets at the end of the sentence, like this: "Statement [2]." Do not repeat examples; answer only this question. For numbers from the key figures write [K] and copy the numbers exactly, without calculating yourself. If the answer is not in the sources, write: "I can't find this in the documents." For questions about a single person: point to their page in the cockpit.`
  const user = `${de ? 'Quellen' : 'Sources'}:\n${ctx}\n\n[K] ${de ? 'Kennzahlen dieses Monatslaufs (ohne Namen)' : "Key figures of this month's run (no names)"}:\n${totals || '-'}\n\n${de ? 'Frage' : 'Question'}: ${question}\n\n${task}`
  const chartNote = charts
    ? de
      ? `\n\n[G] Gezeigte Grafiken (die Person sieht sie neben deiner Antwort; Zahlen vom Regelwerk):\n${charts}\nBeschreibe in 2 bis 4 Sätzen, was die Grafik zeigt: das Wichtigste zuerst, mit den genauen Zahlen, Quelle [G]. Nenne keine Namen von Personen.`
      : `\n\n[G] Charts shown (the person sees them next to your answer; numbers from the rules engine):\n${charts}\nDescribe in 2 to 4 sentences what the chart shows: the most important point first, with the exact numbers, source [G]. Do not name any person.`
    : ''
  const past = history.slice(-3).flatMap((h) => [
    { role: 'user', content: h.q },
    { role: 'assistant', content: h.a },
  ])
  return [{ role: 'system', content: sys }, ...past, { role: 'user', content: user + chartNote }]
}

/** Streams the local model's answer; calls onToken with the text so far. */
export async function streamAnswer(
  endpoint: string,
  model: string,
  messages: { role: string; content: string }[],
  onToken: (textSoFar: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const r = await fetch(`${endpoint}/api/chat`, {
    method: 'POST',
    signal,
    body: JSON.stringify({ model, messages, stream: true, keep_alive: '30m', options: { temperature: 0, num_ctx: 4096 } }),
  })
  if (!r.ok || !r.body) throw new Error(`chat ${r.status}`)
  const reader = r.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let out = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      const j = JSON.parse(line) as { message?: { content?: string }; done?: boolean }
      if (j.message?.content) {
        out += j.message.content
        onToken(out)
      }
    }
  }
  return out
}

/** Names, client/Zemis/dossier numbers or dates of birth in a text: then it must not go to a cloud voice. */
export function hasPersonalData(text: string, names: string[]): boolean {
  if (/\b\d{5,}\b|\bD\d{2}\.\d{3,}\b|\bK-\d+|zemis|geburtsdatum|date of birth/i.test(text)) return true
  const t = text.toLowerCase()
  return names.some((n) => n.length > 2 && new RegExp(`\\b${n.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(t))
}

export const INDEX_INFO = { size: chunks.length, sources: [...new Set(chunks.map((c) => c.source))] }
