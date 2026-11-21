/* Synthetic Situationsanalyse reports (German free text) from the generator's ground truth.
 * SYNTHETIC: not real people. Run after generate.ts:  npx tsx scripts/reports.ts
 * Writes sample-data/2026-11/situationsanalyse/SA_<Dossier>.txt (+ PDFs via scripts/pdf.py)
 * and sample-data/labels/report_truth.json = what each report actually states, per person.
 */
import fs from 'node:fs';
import path from 'node:path';

const OUT = path.resolve('sample-data/2026-11/situationsanalyse');
const truth = JSON.parse(fs.readFileSync('sample-data/labels/situationsanalyse_truth.json', 'utf8')) as HH[];

interface Member {
  zemis: string; klientNr: string; vorname: string; name: string; sex: 'm' | 'w'; birth: string; role: string;
  nationality: string; motherTongue: string; entry: string; status: string; school: number; fields: Record<string, unknown> | null;
}
interface HH { dossier: string; socialWorker: string; newThisMonth: boolean; persona: string | null; members: Member[] }

export const FIELDS = [
  'childcare_duty_without_care',
  'literate_latin_script',
  'understands_swiss_german',
  'learning_pace',
  'health_limits_work',
  'availability_for_work_or_education',
  'work_experience_years_origin',
  'diplomas',
  'driving_licence',
  'career_wish',
] as const;

let seed = 4711;
const rnd = () => {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
};
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
const age = (birth: string) => {
  const [d, m, y] = birth.split('.').map(Number);
  let a = 2026 - y;
  if (m > 11 || (m === 11 && d > 20)) a--;
  return a;
};

function phrases(m: Member, f: string, v: unknown, hasSmallKids: boolean): string | undefined {
  const er = m.sex === 'w' ? 'Sie' : 'Er';
  const anrede = m.sex === 'w' ? `Frau ${m.name[0]}.` : `Herr ${m.name[0]}.`;
  switch (f) {
    case 'childcare_duty_without_care':
      if (!hasSmallKids) return undefined;
      return v === 'yes'
        ? pick([`${anrede} betreut die kleinen Kinder zu Hause; ein Kita-Platz ist noch nicht gefunden.`, `Die Kinder sind noch nicht in einer Kita, ${er.toLowerCase()} übernimmt die Betreuung tagsüber selbst.`, `Kinderbetreuung: zu Hause durch ${anrede}, kein Kita-Platz vorhanden.`])
        : pick([`Die Kinder besuchen eine Kita, ${er.toLowerCase()} ist tagsüber verfügbar.`, `Kinderbetreuung ist über die Kita geregelt.`]);
    case 'literate_latin_script':
      return v === 'yes'
        ? pick([`Alphabetisiert in der Muttersprache und in lateinischer Schrift.`, `${er} liest und schreibt lateinische Schrift.`, `Alphabetisierung Zielsprache: ja.`])
        : pick([`${er} ist in lateinischer Schrift nicht alphabetisiert.`, `Alphabetisierung Zielsprache: nein, ein Alphabetisierungskurs ist nötig.`, `Lateinische Schrift kann ${er.toLowerCase()} noch nicht lesen.`]);
    case 'understands_swiss_german':
      return v === 'yes'
        ? pick([`Versteht Schweizerdeutsch im Alltag recht gut.`, `Schweizerdeutsch wird verstanden.`])
        : pick([`Versteht kein Schweizerdeutsch.`, `Schweizerdeutsch versteht ${er.toLowerCase()} noch nicht.`]);
    case 'learning_pace':
      return {
        good: pick([`Lerntempo gut.`, `${er} lernt schnell und motiviert.`]),
        medium: pick([`Lerntempo mittel.`, `${er} lernt in einem durchschnittlichen Tempo.`]),
        slow: pick([`Lerntempo langsam, braucht viele Wiederholungen.`, `${er} lernt langsam.`]),
      }[v as string];
    case 'health_limits_work':
      return {
        none: pick([`Keine gesundheitlichen Einschränkungen bekannt.`, `Gesundheitlich keine Einschränkung der Arbeitsfähigkeit.`]),
        some: pick([`Rückenbeschwerden schränken körperlich schwere Arbeit ein.`, `Leichte gesundheitliche Einschränkungen, körperliche Arbeit nur teilweise möglich.`]),
        strong: pick([`Laut Arztzeugnis ist die Arbeitsfähigkeit derzeit stark eingeschränkt.`, `Starke gesundheitliche Einschränkung, aktuell nicht arbeitsfähig (Arztzeugnis liegt vor).`]),
      }[v as string];
    case 'availability_for_work_or_education':
      return {
        full: pick([`Verfügbar für Arbeit oder Ausbildung: vollzeit.`, `${er} ist voll verfügbar für Arbeit oder Bildung.`]),
        partial: pick([`Verfügbarkeit für Arbeit oder Bildung: teilweise.`, `${er} ist nur teilzeitlich verfügbar.`]),
        none: pick([`Zurzeit nicht verfügbar für Arbeit oder Bildung.`]),
      }[v as string];
    case 'work_experience_years_origin': {
      const n = Number(v);
      if (!n) return pick([`Keine Berufserfahrung im Herkunftsland.`, `Bisher keine Arbeitserfahrung.`]);
      return pick([`Im Herkunftsland ${n} Jahre Berufserfahrung.`, `${er} hat ${n} Jahre im Herkunftsland gearbeitet.`]);
    }
    case 'diplomas':
      return v === 'yes' ? pick([`Diplome: ja.`, `Ein Berufsdiplom aus dem Herkunftsland ist vorhanden.`]) : pick([`Keine Diplome.`, `Diplome: nein.`]);
    case 'driving_licence':
      return {
        no: pick([`Kein Führerschein.`, `Führerschein: nein.`]),
        yes_not_recognised: pick([`Führerschein aus dem Herkunftsland, in der Schweiz nicht anerkannt.`]),
        yes_recognised: pick([`Führerschein vorhanden und in der Schweiz anerkannt.`]),
      }[v as string];
    case 'career_wish':
      return pick([`Möchte im Bereich ${v} arbeiten.`, `Berufliche Perspektive (Sicht Klient/in): ${v}.`, `${er} wünscht sich eine Stelle in ${v}.`]);
  }
  return undefined;
}

function sectionFor(m: Member, idx: number, title: string, hasSmallKids: boolean, stated: Record<string, unknown>, persona: string | null) {
  const f = m.fields ?? {};
  const s = (field: string) => {
    let v = f[field];
    if (field === 'work_experience_years_origin' && v === undefined) v = 0;
    if (v === undefined || v === null || v === 'not_stated') return '';
    // Amina's report is written exactly as in the approved prototype
    if (persona === 'amina') return '';
    if (rnd() < 0.15) return ''; // omitted in this report -> not_stated
    const t = phrases(m, field, v, hasSmallKids);
    if (!t) return '';
    stated[field] = v;
    return t + ' ';
  };
  const lines: string[] = [];
  lines.push(`${idx}. Individuelle Potenzialerhebung ${title}: ${m.vorname} ${m.name} (Zemis-Nr. ${m.zemis})`);
  lines.push(`${idx}.1 Gesundheit`);
  lines.push((s('health_limits_work') || 'Keine Angaben.').trim());
  lines.push(`${idx}.2 Sprachliche Integration`);
  lines.push(`Muttersprache ${m.motherTongue}. ${s('literate_latin_script')}Deutsch mündlich ${pick(['A0', 'A0', 'A1'])}. ${s('understands_swiss_german')}${s('learning_pace')}`.trim());
  lines.push(`${idx}.3 Berufliche Integration`);
  lines.push(`${s('work_experience_years_origin')}${s('diplomas')}${s('driving_licence')}${s('availability_for_work_or_education')}${s('childcare_duty_without_care')}`.trim() || 'Keine Angaben.');
  lines.push(`${idx}.4 Potenzialeinschätzung`);
  lines.push(`${s('career_wish')}${pick(['Motiviert und zuverlässig.', 'Wirkt motiviert.', 'Braucht Unterstützung bei der Stellensuche.', ''])}`.trim() || 'Keine Angaben.');
  return lines.join('\n');
}

function aminaSection(m: Member, idx: number, stated: Record<string, unknown>) {
  Object.assign(stated, {
    childcare_duty_without_care: 'yes',
    health_limits_work: 'none',
    literate_latin_script: 'yes',
    understands_swiss_german: 'no',
    learning_pace: 'good',
    work_experience_years_origin: 6,
    diplomas: 'no',
    career_wish: 'Textil / Schneiderei oder Pflege',
  });
  return [
    `${idx}. Individuelle Potenzialerhebung Dossierträger/-in: ${m.vorname} ${m.name} (Zemis-Nr. ${m.zemis})`,
    `${idx}.1 Gesundheit`,
    'Keine gesundheitlichen Einschränkungen bekannt.',
    `${idx}.2 Sprachliche Integration`,
    'Muttersprache Tigrinya. Alphabetisiert in Tigrinya und in lateinischer Schrift. Deutsch mündlich A0. Versteht kein Schweizerdeutsch. Lerntempo gut, Kursbesuch wegen Kinderbetreuung unregelmässig.',
    `${idx}.3 Berufliche Integration`,
    'In Eritrea 6 Jahre als Schneiderin tätig. Keine Diplome. EDV-Kenntnisse: Grundkenntnisse. Die beiden Kinder (2 und 3 Jahre) werden zu Hause betreut; ein Kita-Platz ist noch nicht gefunden.',
    `${idx}.4 Potenzialeinschätzung`,
    'Möchte im Bereich Textil oder Pflege arbeiten, sobald die Kinder betreut sind.',
  ].join('\n');
}

const reportTruth: Record<string, { dossier: string; persons: Record<string, Record<string, unknown>> }> = {};
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) if (/^SA_.*\.(txt|pdf)$/.test(f)) fs.unlinkSync(path.join(OUT, f)); // keep extractions.json / accuracy.json
let n = 0;
for (const hh of truth) {
  const head = hh.members.find((m) => m.role === 'head')!;
  const partner = hh.members.find((m) => m.role === 'spouse');
  const kids = hh.members.filter((m) => m.role === 'child');
  const older = hh.members.filter((m) => m.fields && m.role !== 'head' && m.role !== 'spouse' && age(m.birth) >= 16);
  const smallKids = kids.some((k) => age(k.birth) < 4);
  const sw = hh.socialWorker;
  const initials = sw.replace(/[^A-ZÄÖÜ]/g, '');
  const date = head.entry || head.birth;
  const L: string[] = [];
  L.push('Asylsozialdienst der Stadt Bern · Effingerstrasse 33 · 3008 Bern');
  L.push('SYNTHETISCHER BERICHT · keine echte Person · AI for Access Hackathon');
  L.push('Situationsanalyse und Potenzialerhebung');
  L.push(`Datum: ${hh.newThisMonth ? pick(['28.10.2026', '04.11.2026', '11.11.2026', '16.11.2026']) : date} · Verfasst: ${initials} · Dossier-Nr. ${hh.dossier}`);
  L.push('1. Personalien');
  L.push('1.1 Dossierträger/-in');
  L.push(`Name: ${head.name} · Vorname: ${head.vorname} · Geburtsdatum: ${head.birth} · Nationalität: ${head.nationality} · Aufenthaltsstatus: ${head.status} · Einreisedatum: ${head.entry || '–'} · Zemis-Nr.: ${head.zemis} · Zust. SAR: ${sw}`);
  if (partner) {
    L.push('1.2 Partner/-in');
    L.push(`Name: ${partner.name} · Vorname: ${partner.vorname} · Geburtsdatum: ${partner.birth} · Nationalität: ${partner.nationality} · Aufenthaltsstatus: ${partner.status} · Zemis-Nr.: ${partner.zemis}`);
  }
  kids.forEach((k, i) => {
    L.push(`1.${i + 3} Kind ${i + 1}`);
    const a = age(k.birth);
    const care = a < 4 ? (hh.members.some((m) => m.fields?.childcare_duty_without_care === 'yes') ? 'zu Hause' : 'Kita') : a < 16 ? 'Schule' : '–';
    L.push(`Name: ${k.name} · Vorname: ${k.vorname} · Geburtsdatum: ${k.birth} · Geschlecht: ${k.sex === 'w' ? 'weiblich' : 'männlich'} · Zemis-Nr.: ${k.zemis} · Kinderbetreuung: ${care}`);
  });
  const hf = head.fields ?? {};
  L.push('2. Situationsanalyse');
  L.push('2.1 Familiäre Situation, soziales Umfeld');
  L.push(
    [
      hh.members.length === 1 ? pick([`${head.vorname} ${head.name} lebt allein.`, 'Einzelperson, keine Angehörigen in der Schweiz.']) : `Der Haushalt umfasst ${hh.members.length} Personen.`,
      hf.family_reunification_pending === 'yes' ? 'Ein Gesuch um Familiennachzug ist hängig.' : '',
      hf.volunteer_network === 'yes' ? pick(['Kontakt zu Freiwilligen der Kirchgemeinde.', 'Gut vernetzt, eine Freiwillige unterstützt beim Deutschlernen.']) : '',
    ]
      .filter(Boolean)
      .join(' '),
  );
  L.push('2.2 Wohnen');
  L.push(hf.looking_for_housing === 'yes' ? 'Wohnt in der Kollektivunterkunft, auf Wohnungssuche: ja.' : pick(['Wohnt in einer eigenen Wohnung.', 'Wohnsituation stabil, keine Wohnungssuche.']));
  L.push('2.3 Alltagsführung');
  L.push(pick(['Administration wird mit Unterstützung erledigt.', 'Erledigt die Administration weitgehend selbständig.', 'Braucht Hilfe bei Briefen und Terminen.']));
  L.push('2.4 Kooperation und Zusammenarbeit');
  L.push(pick(['Termine werden zuverlässig wahrgenommen.', 'Ist meist pünktlich und gut erreichbar.', 'Erreichbarkeit manchmal schwierig.']));
  L.push('2.5 Finanzen');
  L.push(hf.debts === 'yes' ? 'Es bestehen Schulden (Krankenkasse).' : 'Keine Schulden bekannt.');
  const persons: Record<string, Record<string, unknown>> = {};
  const people: [Member, string][] = [[head, 'Dossierträger/-in']];
  if (partner?.fields) people.push([partner, 'Partner/-in']);
  older.forEach((o) => people.push([o, 'Kind über 16 J.']));
  people.forEach(([m, title], i) => {
    const stated: Record<string, unknown> = {};
    L.push(hh.persona === 'amina' && m === head ? aminaSection(m, i + 3, stated) : sectionFor(m, i + 3, title, smallKids && (m.role === 'head' || m.role === 'spouse'), stated, null));
    persons[m.zemis] = Object.fromEntries(FIELDS.map((f) => [f, stated[f] ?? 'not_stated']));
  });
  const file = `SA_${hh.dossier.replace('.', '_')}.txt`;
  fs.writeFileSync(path.join(OUT, file), L.join('\n') + '\n');
  reportTruth[file] = { dossier: hh.dossier, persons };
  n++;
}
fs.writeFileSync('sample-data/labels/report_truth.json', JSON.stringify(reportTruth, null, 1));
const index = truth.map((h) => ({
  file: `SA_${h.dossier.replace('.', '_')}.txt`,
  dossier: h.dossier,
  socialWorker: h.socialWorker,
  newThisMonth: h.newThisMonth,
  persona: h.persona,
}));
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify(index, null, 1));
console.log(`${n} reports written to ${OUT}`);
