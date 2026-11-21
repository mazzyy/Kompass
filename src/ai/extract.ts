// AI component 1: Situationsanalyse field extraction with a LOCAL model (Ollama).
// Rules decide traffic lights; this only proposes fields with verbatim evidence. People confirm.

export const SA_FIELDS = [
  { id: 'childcare_duty_without_care', type: 'enum', values: ['yes', 'no'], de: 'Kinderbetreuung ohne Kita-Platz', en: 'Childcare duty without daycare', hint: 'yes if this person looks after small children at home because there is no daycare (Kita) place; no if a Kita place exists' },
  { id: 'literate_latin_script', type: 'enum', values: ['yes', 'no'], de: 'Alphabetisiert in lateinischer Schrift', en: 'Literate in Latin script', hint: 'can read and write Latin script ("Alphabetisierung Zielsprache")' },
  { id: 'understands_swiss_german', type: 'enum', values: ['yes', 'no'], de: 'Versteht Schweizerdeutsch', en: 'Understands Swiss German', hint: '' },
  { id: 'learning_pace', type: 'enum', values: ['slow', 'medium', 'good'], de: 'Lerntempo', en: 'Learning pace', hint: '"Lerntempo"; schnell/gut = good, mittel/durchschnittlich = medium, langsam = slow' },
  { id: 'health_limits_work', type: 'enum', values: ['none', 'some', 'strong'], de: 'Gesundheit schränkt Arbeit ein', en: 'Health limits work', hint: 'none = no limitation; some = partly limited (e.g. no heavy physical work); strong = currently not able to work / strongly limited' },
  { id: 'availability_for_work_or_education', type: 'enum', values: ['full', 'partial', 'none'], de: 'Verfügbarkeit für Arbeit/Bildung', en: 'Availability for work or education', hint: 'only if a sentence explicitly says verfügbar/Verfügbarkeit: vollzeit/voll = full, teilweise/teilzeitlich = partial, nicht verfügbar = none' },
  { id: 'work_experience_years_origin', type: 'number', values: [], de: 'Jahre Berufserfahrung Herkunftsland', en: 'Years of work experience (origin)', hint: 'number of years worked in the country of origin; 0 if the text says no work experience' },
  { id: 'diplomas', type: 'enum', values: ['yes', 'no'], de: 'Diplome', en: 'Diplomas', hint: '' },
  { id: 'driving_licence', type: 'enum', values: ['yes_recognised', 'yes_not_recognised', 'no'], de: 'Führerschein', en: 'Driving licence', hint: 'yes_recognised only if recognised in Switzerland' },
  { id: 'career_wish', type: 'text', values: [], de: 'Berufswunsch', en: 'Career wish', hint: 'the field of work the person wants, short, in German as written' },
] as const;

export type SaFieldId = (typeof SA_FIELDS)[number]['id'];

export interface Extracted {
  value: string | number | null;
  status: 'stated' | 'not_stated' | 'unclear';
  evidence: string;
}

export interface PersonBlock {
  zemis: string;
  name: string;
  role: string;
  text: string;
}

export interface SplitReport {
  headZemis?: string;
  household: string;
  persons: PersonBlock[];
}

export interface PersonExtraction {
  zemis: string;
  name: string;
  fields: Record<SaFieldId, Extracted>;
  ms: number;
}

export interface ReportExtraction {
  file: string;
  model: string;
  at: string; // ISO time of the model run
  persons: PersonExtraction[];
}

export const norm = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/[„“”"«»]/g, '"')
    .trim()
    .toLowerCase();

const HEADER_RE = /(\d+)\.\s*Individuelle\s+Potenzialerhebung\s+([^:]+?):\s*([^()]+?)\s*\(Zemis-Nr\.\s*(\d{6,9})\)/g;

/** Split a report into the household part (sections 1-2) and one block per person (sections 3+). */
export function splitReport(text: string): SplitReport {
  const t = text.replace(/\r/g, '');
  const matches = [...t.matchAll(HEADER_RE)];
  const head = t.match(/Zemis-Nr\.:\s*(\d{6,9})/);
  if (!matches.length) return { headZemis: head?.[1], household: t, persons: [] };
  const persons: PersonBlock[] = matches.map((m, i) => ({
    zemis: m[4],
    role: m[2].replace(/\s+/g, ' ').trim(),
    name: m[3].replace(/\s+/g, ' ').trim(),
    text: t.slice(m.index!, i + 1 < matches.length ? matches[i + 1].index : t.length).trim(),
  }));
  return { headZemis: head?.[1], household: t.slice(0, matches[0].index).trim(), persons };
}

/** Sentences of the person part, numbered. Evidence is a sentence number, so it is always verbatim. */
const SECTION_RE = /\b\d+\.\d+\s+(Gesundheit|Sprachliche Integration|Berufliche Integration|Potenzialeinschätzung)\b/g;

export function sentences(text: string): string[] {
  // Works for .txt and for PDF text (where paragraphs are wrapped over several lines).
  return text
    .replace(new RegExp(HEADER_RE.source), ' ')
    .replace(SECTION_RE, '§')
    .replace(/\s+/g, ' ')
    .split('§')
    .flatMap((l) => l.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/))
    .map((x) => x.trim())
    .filter((x) => x && x !== 'Keine Angaben.');
}

function schema() {
  const props: Record<string, unknown> = {};
  for (const f of SA_FIELDS) {
    props[f.id] = {
      type: 'object',
      properties: {
        value: f.type === 'number' ? { type: ['number', 'null'] } : f.type === 'enum' ? { type: ['string', 'null'], enum: [...f.values, null] } : { type: ['string', 'null'] },
        sentence: { type: ['integer', 'null'] },
      },
      required: ['value', 'sentence'],
    };
  }
  return { type: 'object', properties: props, required: SA_FIELDS.map((f) => f.id) };
}

export function buildPrompt(p: PersonBlock, sents: string[]): string {
  const defs = SA_FIELDS.map((f) => `- ${f.id}: ${f.type === 'enum' ? f.values.join(' | ') : f.type}${f.hint ? ` (${f.hint})` : ''}`).join('\n');
  return `Extract facts about ${p.name} from these numbered sentences of a German social-work report.
For each field return the value and the number of the ONE sentence that states it.
If no sentence clearly states the field, return value null and sentence null. Never guess or infer from other fields.

Fields:
${defs}

Sentences:
${sents.map((x, i) => `[${i + 1}] ${x}`).join('\n')}`;
}

/** Validate the model's answer: enum/number values; evidence = the referenced sentence, which must exist. */
export function postprocess(raw: Record<string, { value?: unknown; sentence?: unknown }>, sents: string[]): Record<SaFieldId, Extracted> {
  const out = {} as Record<SaFieldId, Extracted>;
  for (const f of SA_FIELDS) {
    const r = raw?.[f.id] ?? {};
    let value = (r.value ?? null) as string | number | null;
    const idx = typeof r.sentence === 'number' ? r.sentence : null;
    if (value === null || value === '' || idx === null) {
      out[f.id] = { value: null, status: 'not_stated', evidence: '' };
      continue;
    }
    let status: Extracted['status'] = 'stated';
    const evidence = sents[idx - 1] ?? '';
    if (!evidence) status = 'unclear';
    if (f.type === 'enum' && !(f.values as readonly string[]).includes(String(value))) status = 'unclear';
    if (f.type === 'number') {
      const n = Number(value);
      if (isNaN(n)) status = 'unclear';
      else value = n;
    }
    out[f.id] = { value, status, evidence };
  }
  return out;
}

export interface OllamaOpts {
  endpoint: string;
  model: string;
  signal?: AbortSignal;
}

export async function extractPerson(p: PersonBlock, o: OllamaOpts): Promise<PersonExtraction> {
  const t0 = Date.now();
  const sents = sentences(p.text);
  const res = await fetch(`${o.endpoint}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal: o.signal,
    body: JSON.stringify({
      model: o.model,
      prompt: buildPrompt(p, sents),
      format: schema(),
      stream: false,
      options: { temperature: 0, num_ctx: 2048, seed: 1 },
    }),
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const j = (await res.json()) as { response: string };
  let raw: Record<string, { value?: unknown; sentence?: unknown }> = {};
  try {
    raw = JSON.parse(j.response);
  } catch {
    raw = {};
  }
  return { zemis: p.zemis, name: p.name, fields: postprocess(raw, sents), ms: Date.now() - t0 };
}

export async function extractReport(file: string, text: string, o: OllamaOpts, onPerson?: (p: PersonExtraction) => void): Promise<ReportExtraction> {
  const sp = splitReport(text);
  const persons: PersonExtraction[] = [];
  for (const p of sp.persons) {
    const r = await extractPerson(p, o);
    persons.push(r);
    onPerson?.(r);
  }
  return { file, model: o.model, at: new Date().toISOString(), persons };
}

/** Compare to ground truth (synthetic labels). Text fields: shared word counts as correct. */
export function fieldCorrect(f: SaFieldId, got: Extracted, want: unknown): boolean {
  if (want === 'not_stated' || want === undefined) return got.status === 'not_stated';
  if (got.status !== 'stated') return false;
  if (f === 'work_experience_years_origin') return Number(got.value) === Number(want);
  if (f === 'career_wish') {
    const a = new Set(norm(String(want)).split(/[^a-zäöü]+/).filter((w) => w.length > 3));
    return norm(String(got.value)).split(/[^a-zäöü]+/).some((w) => a.has(w));
  }
  return String(got.value) === String(want);
}
