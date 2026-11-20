/* Synthetic ASD exports for the AI for Access hackathon. NOT REAL PEOPLE.
 * Deterministic: same seed -> same files. Run: npx tsx scripts/generate.ts
 * Writes sample-data/2026-10 and sample-data/2026-11 (11 xlsx each) + labels + planted_effects.md.
 */
import ExcelJS from 'exceljs';
import fs from 'node:fs';
import path from 'node:path';
import { addDays, addMonths, addYears, d, fmt, iso, type Day } from '../src/engine/dates';
import { TABLE_BY_ID, type TableId } from '../src/engine/import/signatures';
import { AUSBILDUNG, CAREERS, EMPLOYERS, ORIGINS, ORTE, PROGRAMS, SOCIAL_WORKERS, ZIVIL, type Origin } from './gen/lists';

// ---------------- RNG ----------------
let seed = 20261120;
function rnd(): number {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const chance = (p: number) => rnd() < p;
const pick = <T>(a: T[]): T => a[Math.floor(rnd() * a.length)];
function weighted<T>(items: [T, number][]): T {
  const tot = items.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * tot;
  for (const [v, w] of items) if ((r -= w) <= 0) return v;
  return items[items.length - 1][0];
}

const M1 = d('20.10.2026');
const M2 = d('20.11.2026');
const OUT = path.resolve('sample-data');

// ---------------- model ----------------
interface Hist { von: Day; bis?: Day; status: string }
interface Ev { art: string; datum: Day; erledigung?: string; code?: number; edatum?: Day }
interface Lang { sprache: string; niveau: string; art: string; datum: Day; bem?: string }
interface Course { art: string; bez: string; start: Day; end?: Day; hours: number; inst: string; bem?: string }
interface Job { von: Day; bis?: Day; ag: string; ort: string; pensum: number; status: string; bem?: string; zemisName?: string; noZemis?: boolean; zemisOnly?: boolean }
interface Housing { von: Day; bis?: Day; art: string; ort: string }
interface Proven { art: string; datum: Day; kohorte: number }
interface P {
  knr: string; zemis: string; dossier: string; vorname: string; name: string; sex: 'm' | 'w'; birth: Day;
  origin: Origin; mutter: string; role: 'head' | 'spouse' | 'child' | 'other'; status: string; hist: Hist[];
  entry?: Day; app?: Day; bornInCH?: boolean; zBeginn: Day; zEnde?: Day; uebergang?: Day;
  school: number; ausbildung: string; latin: boolean; workYears: number; zivil: string;
  events: Ev[]; lang: Lang[]; courses: Course[]; jobs: Job[]; housing: Housing[]; proven: Proven[];
  sa?: Record<string, unknown>; persona?: string; klientStatusOverride?: string; hideEntry?: boolean;
  highHours?: boolean; childcare?: boolean; swissGerman?: boolean;
}
interface Fin { art: string; von: Day; bis?: Day; grund?: string }
interface HH { dossier: string; members: P[]; sw: string; fin: Fin[]; entry: Day; newM2?: boolean; persona?: string }

const households: HH[] = [];
const usedKnr = new Set(['10217', '10351', '10633', '10482', '10790', '10905']);
const usedZemis = new Set<string>();
const usedDossier = new Set<string>(['D12.4471']);
const newKnr = () => { let k: string; do k = String(int(10000, 19999)); while (usedKnr.has(k)); usedKnr.add(k); return k; };
const newZemis = () => { let z: string; do z = String(int(20000000, 59999999)); while (usedZemis.has(z)); usedZemis.add(z); return z; };
const newDossier = () => { let x: string; do x = `D12.${int(1000, 9999)}`; while (usedDossier.has(x)); usedDossier.add(x); return x; };

function zEndeFor(status: string, entry: Day | undefined, app: Day | undefined): Day | undefined {
  const base = status.replace(/\+\d$/, '');
  if (['VA', 'F-FL'].includes(base)) return entry !== undefined ? addYears(entry, 7) : undefined;
  if (['B-FL', 'B-RSFL', 'B-SL'].includes(base)) return app !== undefined ? addYears(app, 5) : undefined;
  if (base === 'S') return entry !== undefined ? addYears(entry, 5) : undefined;
  return undefined; // N: open
}

function decisionFor(status: string): [string | null, string] {
  // [extra Asylgeschäftsart event or null, Erledigung of the application]
  switch (status.replace(/\+\d$/, '')) {
    case 'B-FL': return [null, 'Asylgewährung Art. 3, 7'];
    case 'B-RSFL': return [null, 'Asylgewährung Art. 51.1'];
    case 'B-SL': return ['Überprüfung Staatenlosigkeit', 'Anerkennung Staatenlosigkeit'];
    case 'F-FL': return ['VA für Flüchtlinge', 'Ablehnung mit Fl.-Eigenschaft Art 3, 7'];
    case 'VA': return ['VA AsylG', 'Ablehnung'];
    case 'S': return [null, 'Vorübergehender Schutz gewährt'];
    default: return [null, '(Leer)'];
  }
}

/** Build events + status history + responsibility for a person who entered on `entry`. */
function asylum(p: P, entry: Day | undefined, finalStatus: string, opts: { app?: Day; decision?: Day } = {}) {
  p.status = finalStatus;
  if (p.bornInCH || entry === undefined) {
    // born in CH: no entry; status follows parents from birth
    p.events.push({ art: 'Aufenthalt (Geburt)', datum: p.birth });
    p.hist = [{ von: p.birth, status: finalStatus }];
    p.app = undefined;
    p.zEnde = undefined;
    return;
  }
  p.entry = entry;
  const isS = finalStatus === 'S';
  const app = opts.app ?? addDays(entry, int(0, 6));
  p.app = app;
  p.events.push({ art: 'Aufenthalt (Einreise)', datum: entry });
  const appEv: Ev = {
    art: isS ? 'Gesuch vorübergehender Schutz' : pick(['Asylgesuch in CH (Bund direkt, Kat. I)', 'Asylgesuch in CH (Kt normal, Kat. III)']),
    datum: app,
  };
  p.events.push(appEv);
  if (finalStatus === 'N (Asylsuchende)') {
    p.hist = [{ von: app, status: 'N (Asylsuchende)' }];
  } else {
    const dec = opts.decision ?? addDays(app, isS ? int(5, 30) : int(60, 330));
    const [extra, erl] = decisionFor(finalStatus);
    Object.assign(appEv, { erledigung: erl, code: int(1000, 9999), edatum: dec });
    if (extra) p.events.push({ art: extra, datum: dec, erledigung: extra === 'VA AsylG' ? 'VA verfügt (unzumutbar)' : 'Gutheissung', code: int(1000, 9999), edatum: dec });
    p.hist = isS ? [{ von: dec, status: 'S' }] : [{ von: app, bis: addDays(dec, -1), status: 'N (Asylsuchende)' }, { von: dec, status: finalStatus }];
  }
  p.zEnde = /\+\d$/.test(finalStatus) ? addMonths(M2, int(2, 30)) : zEndeFor(finalStatus, entry, app);
}

function newPerson(hh: { dossier: string }, origin: Origin, sex: 'm' | 'w', birth: Day, role: P['role'], last: string): P {
  const school = role === 'child' ? 0 : weighted<number>([[0, 12], [3, 10], [6, 18], [9, 30], [12, 22], [15, 8]]);
  const latinP = origin.latinNative ? 0.9 : school >= 12 ? 0.85 : school >= 9 ? 0.7 : school >= 6 ? 0.45 : school >= 3 ? 0.2 : 0.04;
  const latin = role === 'child' ? true : chance(latinP);
  return {
    knr: newKnr(), zemis: newZemis(), dossier: hh.dossier, vorname: pick(sex === 'm' ? origin.m : origin.f), name: last, sex, birth,
    origin, mutter: pick(origin.langs), role, status: '', hist: [], zBeginn: 0,
    school, ausbildung: school === 0 ? 'keine' : school < 9 ? 'obligatorische Schule' : weighted([['obligatorische Schule', 3], ['Berufslehre', 3], ['Mittelschule', 2], ['Universität / Hochschule', school >= 12 ? 3 : 0]]),
    latin, workYears: role === 'child' ? 0 : weighted<number>([[0, 25], [int(1, 4), 35], [int(5, 20), 40]]),
    zivil: role === 'child' ? 'ledig' : 'ledig', events: [], lang: [], courses: [], jobs: [], housing: [], proven: [],
  };
}

const ageAtDay = (birth: Day, at: Day) => Math.floor((at - birth) / 365.25);

// ---------------- personas (exact facts from SYNTHETIC_DATA_SPEC.md) ----------------
const ER = ORIGINS.find((o) => o.land === 'Eritrea')!;
const AF = ORIGINS.find((o) => o.land === 'Afghanistan')!;
const IR = ORIGINS.find((o) => o.land === 'Iran')!;

function personaHH(dossier: string, sw: string, entry: Day, persona: string): HH {
  usedDossier.add(dossier);
  const hh: HH = { dossier, members: [], sw, fin: [], entry, persona };
  households.push(hh);
  return hh;
}
function setPersona(p: P, knr: string, vorname: string, name: string, persona: string) {
  usedKnr.add(knr);
  p.knr = knr; p.vorname = vorname; p.name = name; p.persona = persona;
}

function buildPersonas() {
  // Yonas G. — B-FL, born 1997, single
  {
    const hh = personaHH(newDossier(), 'S. Keller', d('02.10.2023'), 'yonas');
    const p = newPerson(hh, ER, 'm', d('11.07.1997'), 'head', 'Ghebremariam');
    setPersona(p, '10217', 'Yonas', 'Ghebremariam', 'yonas');
    p.mutter = 'Tigrinya'; p.latin = true; p.school = 11; p.ausbildung = 'obligatorische Schule'; p.workYears = 3;
    asylum(p, d('02.10.2023'), 'B-FL', { app: d('05.10.2023'), decision: d('14.03.2024') });
    p.zBeginn = d('01.04.2024');
    p.lang.push({ sprache: 'Deutsch', niveau: 'A0', art: 'Einstufung', datum: d('15.04.2024') });
    p.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A1', start: d('06.05.2024'), end: d('20.12.2024'), hours: 9, inst: 'Bildungsinstitut Bern' });
    p.lang.push({ sprache: 'Deutsch', niveau: 'A1', art: 'Kursbestätigung', datum: d('20.09.2026'), bem: 'Abendkurs, keine Prüfung' });
    p.jobs.push({ von: d('01.03.2025'), ag: 'Transmed Logistik AG', ort: 'Härkingen', pensum: 80, status: 'unselbstständig', bem: 'Logistikhelfer', zemisName: 'Transmed Logistik AG / Einsatzort Härkingen' });
    p.housing.push({ von: d('01.04.2024'), bis: d('31.01.2025'), art: 'Kollektivunterkunft', ort: '3027 Bern' }, { von: d('01.02.2025'), art: 'WG / Untermiete', ort: '3014 Bern' });
    hh.fin.push({ art: 'Sozialhilfe', von: d('01.04.2024') });
    p.sa = { literate_latin_script: 'yes', learning_pace: 'good', career_wish: 'Logistik' };
    hh.members.push(p);
  }
  // Reza H. — VA, born 1984, head of D12.4471, wife + children 2016, 2019
  {
    const entry = d('15.12.2020');
    const hh = personaHH('D12.4471', 'S. Keller', entry, 'reza');
    const p = newPerson(hh, IR, 'm', d('22.03.1984'), 'head', 'Hosseini');
    setPersona(p, '10351', 'Reza', 'Hosseini', 'reza');
    p.mutter = 'Farsi'; p.latin = true; p.school = 12; p.workYears = 10; p.zivil = 'verheiratet';
    asylum(p, entry, 'VA', { app: d('17.12.2020'), decision: d('20.09.2021') });
    p.zBeginn = d('01.10.2021');
    p.lang.push({ sprache: 'Deutsch', niveau: 'A0', art: 'Einstufung', datum: d('15.10.2021') });
    p.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A1 Intensiv', start: d('01.11.2021'), end: d('30.04.2022'), hours: 15, inst: 'Bildungsinstitut Bern' });
    p.lang.push({ sprache: 'Deutsch', niveau: 'A1', art: 'Zertifikat', datum: d('14.06.2022'), bem: 'fide' });
    p.proven.push({ art: 'Sprache A1', datum: d('14.06.2022'), kohorte: 2021 });
    p.jobs.push({ von: d('05.01.2026'), bis: d('30.06.2026'), ag: 'Hotel Bärengraben AG', ort: 'Bern', pensum: 70, status: 'unselbstständig', bem: 'Küchenhilfe, befristet' });
    p.jobs.push({ von: d('01.09.2026'), ag: 'Gastro Aare GmbH', ort: 'Bern', pensum: 40, status: 'unselbstständig', bem: 'Küchenassistent' });
    const w = newPerson(hh, IR, 'w', d('03.08.1988'), 'spouse', 'Hosseini');
    w.vorname = 'Shirin'; w.mutter = 'Farsi'; w.latin = true; w.school = 12; w.zivil = 'verheiratet';
    asylum(w, entry, 'VA', { app: d('17.12.2020'), decision: d('20.09.2021') });
    w.zBeginn = d('01.10.2021');
    w.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A1', start: d('01.11.2021'), end: d('31.05.2022'), hours: 10, inst: 'Bildungsinstitut Bern' });
    w.lang.push({ sprache: 'Deutsch', niveau: 'A1', art: 'Zertifikat', datum: d('20.09.2022'), bem: 'telc' });
    w.proven.push({ art: 'Sprache A1', datum: d('20.09.2022'), kohorte: 2021 });
    hh.members.push(p, w);
    for (const [b, sex] of [[d('10.05.2016'), 'm'], [d('02.02.2019'), 'w']] as [Day, 'm' | 'w'][]) {
      const c = newPerson(hh, IR, sex, b, 'child', 'Hosseini');
      c.mutter = 'Farsi';
      asylum(c, entry, 'VA', { app: d('17.12.2020'), decision: d('20.09.2021') });
      c.zBeginn = d('01.10.2021');
      hh.members.push(c);
    }
    for (const m of hh.members) m.housing.push({ von: d('01.10.2021'), bis: d('31.03.2023'), art: 'Kollektivunterkunft', ort: '3027 Bern' }, { von: d('01.04.2023'), art: 'Wohnung (vermittelt)', ort: '3018 Bern' });
    hh.fin.push(
      { art: 'Sozialhilfe', von: d('01.10.2021'), bis: d('31.01.2026'), grund: 'Aufnahme einer Erwerbstätigkeit' },
      { art: 'Keine Unterstützung', von: d('01.02.2026'), bis: d('31.08.2026') },
      { art: 'Sozialhilfe', von: d('01.09.2026') },
    );
    p.sa = { learning_pace: 'good', career_wish: 'Gastronomie (Koch)' };
  }
  // Fatima R. — F-FL, born 1985
  {
    const entry = d('30.06.2020');
    const hh = personaHH(newDossier(), 'S. Keller', entry, 'fatima');
    const p = newPerson(hh, AF, 'w', d('14.01.1985'), 'head', 'Rahimi');
    setPersona(p, '10633', 'Fatima', 'Rahimi', 'fatima');
    p.mutter = 'Dari'; p.latin = true; p.school = 10; p.workYears = 8; p.ausbildung = 'Berufslehre'; p.zivil = 'verwitwet';
    asylum(p, entry, 'F-FL', { app: d('02.07.2020'), decision: d('15.02.2021') });
    p.zBeginn = d('01.03.2021');
    p.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A1', start: d('01.04.2021'), end: d('30.11.2021'), hours: 12, inst: 'Bildungsinstitut Bern' });
    p.lang.push({ sprache: 'Deutsch', niveau: 'A1', art: 'Zertifikat', datum: d('15.03.2022'), bem: 'telc' });
    p.lang.push({ sprache: 'Deutsch', niveau: 'A2', art: 'Zertifikat', datum: d('11.05.2025'), bem: 'fide' });
    p.proven.push({ art: 'Sprache A1', datum: d('15.03.2022'), kohorte: 2021 });
    p.courses.push({ art: 'Berufliches Integrationsprogramm', bez: 'Pflegehelferin SRK', start: d('01.02.2026'), end: d('30.06.2026'), hours: 20, inst: 'SRK Kanton Bern' });
    p.jobs.push({ von: d('01.08.2026'), ag: 'Altersresidenz zur Wiese', ort: 'Heiligenschwendi', pensum: 50, status: 'unselbstständig', bem: 'Pflegehelferin', zemisName: 'Altersresidenz zur Wiese Heiligenschwendi' });
    p.housing.push({ von: d('01.03.2021'), art: 'Wohnung (eigene)', ort: '3013 Bern' });
    hh.fin.push({ art: 'Sozialhilfe', von: d('01.03.2021') });
    p.sa = { work_experience_years_origin: 8, health_limits_work: 'none', career_wish: 'Pflege (FaGe)' };
    hh.members.push(p);
  }
  // Amina T. — VA, born 1992, husband + 2 children (2 and 3 years)
  {
    const entry = d('12.03.2024');
    const hh = personaHH(newDossier(), 'S. Keller', entry, 'amina');
    const p = newPerson(hh, ER, 'w', d('05.05.1992'), 'head', 'Tesfay');
    setPersona(p, '10482', 'Amina', 'Tesfay', 'amina');
    p.mutter = 'Tigrinya'; p.latin = true; p.school = 8; p.workYears = 6; p.ausbildung = 'obligatorische Schule'; p.zivil = 'verheiratet';
    asylum(p, entry, 'VA', { app: d('14.03.2024'), decision: d('30.08.2024') });
    p.zBeginn = d('09.09.2024');
    p.lang.push({ sprache: 'Deutsch', niveau: 'A0', art: 'Einstufung', datum: d('03.05.2024') });
    p.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A1 Intensiv', start: d('01.10.2025'), end: d('14.03.2026'), hours: 12, inst: 'Bildungsinstitut Bern' });
    const h = newPerson(hh, ER, 'm', d('19.09.1988'), 'spouse', 'Tesfay');
    h.vorname = 'Filmon'; h.mutter = 'Tigrinya'; h.latin = true; h.school = 9; h.zivil = 'verheiratet'; h.workYears = 7;
    asylum(h, entry, 'VA', { app: d('14.03.2024'), decision: d('30.08.2024') });
    h.zBeginn = d('09.09.2024');
    h.lang.push({ sprache: 'Deutsch', niveau: 'A0', art: 'Einstufung', datum: d('03.05.2024') });
    h.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A1 Intensiv', start: d('01.10.2024'), end: d('31.03.2025'), hours: 15, inst: 'Bildungsinstitut Bern' });
    h.lang.push({ sprache: 'Deutsch', niveau: 'A1', art: 'Zertifikat', datum: d('12.06.2025'), bem: 'fide' });
    h.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A2', start: d('01.09.2026'), end: d('28.02.2027'), hours: 8, inst: 'Bildungsinstitut Bern' });
    hh.members.push(p, h);
    const c1 = newPerson(hh, ER, 'w', d('20.07.2023'), 'child', 'Tesfay');
    asylum(c1, entry, 'VA', { app: d('14.03.2024'), decision: d('30.08.2024') });
    c1.zBeginn = d('09.09.2024');
    const c2 = newPerson(hh, ER, 'm', d('08.11.2024'), 'child', 'Tesfay');
    c2.bornInCH = true;
    asylum(c2, undefined, 'VA');
    c2.zBeginn = d('08.11.2024');
    hh.members.push(c1, c2);
    for (const m of hh.members) m.housing.push({ von: m.zBeginn, art: 'Kollektivunterkunft', ort: '3027 Bern' });
    hh.fin.push({ art: 'Sozialhilfe', von: d('09.09.2024') });
    p.childcare = true;
    p.sa = { childcare_duty_without_care: 'yes', literate_latin_script: 'yes', understands_swiss_german: 'no', learning_pace: 'good', work_experience_years_origin: 6, career_wish: 'Textil / Schneiderei oder Pflege' };
  }
  // Mohammad A. — VA, born 1974
  {
    const entry = d('09.08.2025');
    const hh = personaHH(newDossier(), 'S. Keller', entry, 'mohammad');
    const p = newPerson(hh, AF, 'm', d('03.02.1974'), 'head', 'Ahmadi');
    setPersona(p, '10790', 'Mohammad', 'Ahmadi', 'mohammad');
    p.mutter = 'Paschtu'; p.latin = false; p.school = 4; p.workYears = 25; p.ausbildung = 'obligatorische Schule'; p.zivil = 'verheiratet';
    asylum(p, entry, 'VA', { app: d('11.08.2025'), decision: d('10.09.2025') });
    p.zBeginn = d('15.09.2025');
    p.lang.push({ sprache: 'Deutsch', niveau: 'A0', art: 'Einstufung', datum: d('20.09.2025') });
    p.courses.push({ art: 'Alphabetisierung', bez: 'Deutsch Alpha', start: d('01.10.2025'), end: d('14.02.2026'), hours: 8, inst: 'Bildungsinstitut Bern' });
    p.housing.push({ von: d('15.09.2025'), art: 'Kollektivunterkunft', ort: '3027 Bern' });
    hh.fin.push({ art: 'Sozialhilfe', von: d('15.09.2025') });
    p.sa = { health_limits_work: 'some', literate_latin_script: 'no', learning_pace: 'slow', career_wish: 'Landwirtschaft' };
    hh.members.push(p);
  }
  // Sara K. — B-FL, born 2009, daughter in a family household
  {
    const entry = d('01.06.2024');
    const hh = personaHH(newDossier(), 'S. Keller', entry, 'sara');
    const f = newPerson(hh, ER, 'm', d('12.12.1979'), 'head', 'Kidane');
    f.zivil = 'verheiratet';
    const m = newPerson(hh, ER, 'w', d('30.04.1983'), 'spouse', 'Kidane');
    m.zivil = 'verheiratet';
    const p = newPerson(hh, ER, 'w', d('15.04.2009'), 'child', 'Kidane');
    setPersona(p, '10905', 'Sara', 'Kidane', 'sara');
    p.mutter = 'Tigrinya'; p.latin = true; p.school = 8;
    const b = newPerson(hh, ER, 'm', d('02.09.2013'), 'child', 'Kidane');
    for (const x of [f, m, p, b]) {
      asylum(x, entry, 'B-FL', { app: d('14.06.2024'), decision: d('05.12.2024') });
      x.zBeginn = d('16.12.2024');
      x.housing.push({ von: d('16.12.2024'), art: 'Wohnung (vermittelt)', ort: '3008 Bern' });
    }
    p.lang.push({ sprache: 'Deutsch', niveau: 'A2', art: 'Schulbildung CH', datum: d('30.06.2025'), bem: 'Integrationsklasse' });
    p.courses.push({ art: 'Brückenangebot', bez: 'Berufsvorbereitendes Schuljahr (BVS)', start: d('01.08.2026'), end: d('31.07.2027'), hours: 28, inst: 'Berufsfachschule Bern' });
    f.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A1', start: d('03.02.2025'), end: d('31.07.2025'), hours: 12, inst: 'Bildungsinstitut Bern' });
    f.lang.push({ sprache: 'Deutsch', niveau: 'A1', art: 'Zertifikat', datum: d('15.09.2025'), bem: 'fide' });
    f.jobs.push({ von: d('01.10.2025'), ag: 'Reinigungsdienst Blitzblank GmbH', ort: 'Ostermundigen', pensum: 60, status: 'unselbstständig', bem: 'Reinigung' });
    m.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A1', start: d('03.02.2025'), end: d('31.07.2025'), hours: 10, inst: 'Bildungsinstitut Bern' });
    m.courses.push({ art: 'Deutschkurs', bez: 'Deutsch A1 Prüfungsvorbereitung', start: d('01.09.2026'), end: d('18.12.2026'), hours: 10, inst: 'Bildungsinstitut Bern' });
    b.lang.push({ sprache: 'Deutsch', niveau: 'A1', art: 'Schulbildung CH', datum: d('30.06.2025') });
    hh.members.push(f, m, p, b);
    hh.fin.push({ art: 'Sozialhilfe', von: d('16.12.2024') });
    p.sa = { career_wish: 'Pflege (FaGe)', learning_pace: 'good' };
  }
}

// ---------------- random population ----------------
function entryDate(): Day {
  const y = weighted<number>([[2019, 3], [2020, 6], [2021, 10], [2022, 18], [2023, 22], [2024, 20], [2025, 15], [2026, 6]]);
  const maxDay = y === 2026 ? d('31.08.2026') : d(`31.12.${y}`);
  const minDay = d(`01.01.${y}`);
  return int(minDay, maxDay);
}

function statusDraw(): string {
  return weighted<string>([['VA', 35], ['F-FL', 15], ['B-FL', 25], ['B-RSFL', 3], ['B-SL', 2], ['S', 12], ['N (Asylsuchende)', 3], ['plus', 5]]);
}

function swDraw(): string {
  return weighted(SOCIAL_WORKERS);
}

function randomHousehold(entryOverride?: Day, newM2 = false) {
  let entry = entryOverride ?? entryDate();
  let status = statusDraw();
  const origin = status === 'S' ? ORIGINS.find((o) => o.land === 'Ukraine')! : weighted<Origin>(ORIGINS.filter((o) => o.land !== 'Ukraine').map((o) => [o, o.weight]));
  if (status === 'plus') status = pick(['VA+7', 'F-FL+7', 'B-FL+5', 'B-RSFL+7', 'B-SL+5']);
  if (status === 'S' && entry < d('01.03.2022')) entry = int(d('01.03.2022'), d('31.12.2024'));
  if (status === 'N (Asylsuchende)') entry = int(d('01.06.2025'), d('31.07.2026'));
  const sw = swDraw();
  // Keep S. Keller's other goal-1 deadlines after Amina's (demo story: Reza, Fatima, Amina on top).
  if (sw === 'S. Keller' && entry >= d('01.11.2023') && entry <= d('13.03.2024')) entry = addMonths(entry, 5);
  const hh: HH = { dossier: newDossier(), members: [], sw, fin: [], entry, newM2 };
  const type = weighted<string>([['single', 42], ['couple_kids', 30], ['single_parent', 14], ['couple', 9], ['extended', 5]]);
  const last = pick(origin.last);
  const adultBirth = () => int(addYears(entry, -55), addYears(entry, -19));
  const head = newPerson(hh, origin, type === 'single_parent' ? (chance(0.8) ? 'w' : 'm') : chance(0.62) ? 'm' : 'w', adultBirth(), 'head', last);
  hh.members.push(head);
  if (type === 'couple_kids' || type === 'couple' || type === 'extended') {
    const sp = newPerson(hh, origin, head.sex === 'm' ? 'w' : 'm', Math.min(Math.max(head.birth + int(-2500, 2500), addYears(entry, -55)), addYears(entry, -18)), 'spouse', last);
    head.zivil = sp.zivil = 'verheiratet';
    hh.members.push(sp);
  }
  if (type === 'couple_kids' || type === 'single_parent' || type === 'extended') {
    const n = weighted<number>([[1, 30], [2, 35], [3, 22], [4, 10], [5, 3]]);
    const mother = hh.members.find((m) => m.sex === 'w') ?? head;
    for (let i = 0; i < n; i++) {
      const lo = Math.max(addYears(mother.birth, 18), addYears(entry, -19));
      const hi = Math.min(addYears(mother.birth, 45), addDays(M2, -200));
      if (hi <= lo) break;
      const b = int(lo, hi);
      const c = newPerson(hh, origin, chance(0.5) ? 'm' : 'w', b, 'child', last);
      c.bornInCH = b > entry;
      hh.members.push(c);
    }
  }
  if (type === 'extended') {
    const o = newPerson(hh, origin, chance(0.5) ? 'm' : 'w', int(addYears(entry, -30), addYears(entry, -18)), 'other', last);
    hh.members.push(o);
  }
  if (head.zivil === 'ledig' && type === 'single_parent') head.zivil = pick(ZIVIL.slice(1));
  // asylum + responsibility
  const app = addDays(entry, int(0, 6));
  const dec = addDays(app, status === 'S' ? int(5, 30) : int(60, 330));
  let zb = addDays(dec, int(5, 40));
  if (status === 'N (Asylsuchende)') zb = addDays(app, int(25, 90));
  if (newM2) zb = int(addDays(M1, 1), M2);
  for (const m of hh.members) {
    asylum(m, m.bornInCH ? undefined : entry, status, { app, decision: dec });
    m.zBeginn = m.bornInCH ? Math.max(m.birth, zb) : zb;
  }
  households.push(hh);
}

// ---------------- life courses ----------------
const MS_PER_YEAR = 365.25;
const yearsBetween = (a: Day, b: Day) => (b - a) / MS_PER_YEAR;
const DQ = { kursbest: 0, noEntry: 0, statusMismatch: 0, zemisOnly: 0, overlap: 0, invalid: 0, notRecorded: 0, variants: 0 };

function lifeCourse(hh: HH) {
  const hasSmallKids = hh.members.some((m) => m.role === 'child' && ageAtDay(m.birth, M2) < 4);
  for (const p of hh.members) {
    if (p.persona) continue;
    if (p.entry === undefined && !p.bornInCH) continue;
    const ageEntry = p.entry !== undefined ? ageAtDay(p.birth, p.entry) : 0;
    // housing
    const moveOut = addMonths(p.zBeginn, int(6, 24));
    if (moveOut < M2) p.housing.push({ von: p.zBeginn, bis: addDays(moveOut, -1), art: 'Kollektivunterkunft', ort: '3027 Bern' }, { von: moveOut, art: pick(['Wohnung (eigene)', 'Wohnung (vermittelt)', 'WG / Untermiete']), ort: pick(ORTE) });
    else p.housing.push({ von: p.zBeginn, art: 'Kollektivunterkunft', ort: '3027 Bern' });
    if (p.role === 'child' && ageAtDay(p.birth, M2) < 14) {
      if (ageAtDay(p.birth, M2) >= 7 && p.entry !== undefined && chance(0.6))
        p.lang.push({ sprache: 'Deutsch', niveau: pick(['A1', 'A2', 'B1']), art: 'Schulbildung CH', datum: addMonths(p.zBeginn, int(9, 20)) });
      continue;
    }
    if (p.status === 'N (Asylsuchende)') {
      if (chance(0.5)) p.courses.push({ art: 'Deutschkurs', bez: 'Deutsch für Asylsuchende', start: addDays(p.zBeginn, int(20, 80)), end: addDays(p.zBeginn, int(120, 200)), hours: 6, inst: 'Asylzentrum Bern' });
      continue;
    }
    const teen = ageEntry >= 13 && ageEntry <= 19;
    const isWoman = p.sex === 'w';
    p.childcare = isWoman && hasSmallKids && (p.role === 'head' || p.role === 'spouse') && chance(0.7);
    p.highHours = chance(p.childcare ? 0.25 : 0.55);
    p.swissGerman = chance(0.35);
    const start0 = addDays(p.zBeginn, int(10, 120));
    // ---------------- goal 1 trajectory (planted effects, see planted_effects.md) ----------------
    let prob = 0.55 + (p.latin ? 0.15 : -0.25) + (p.childcare ? -0.2 : 0) + (p.highHours ? 0.12 : 0) + (p.school >= 9 ? 0.1 : 0) + (p.swissGerman ? 0.05 : 0);
    if (teen) prob = 0.92;
    prob = Math.min(0.97, Math.max(0.04, prob));
    const reaches = chance(prob);
    const entry = p.entry ?? p.zBeginn;
    let reachDate: Day | undefined;
    if (reaches) {
      const late = chance(0.1);
      reachDate = addMonths(entry, late ? int(37, 50) : int(9, 34));
      if (reachDate < start0) reachDate = addMonths(start0, int(4, 10));
    }
    if (teen) {
      p.lang.push({ sprache: 'Deutsch', niveau: 'A0', art: 'Einstufung', datum: addDays(p.zBeginn, int(5, 40)) });
      if (reaches) p.lang.push({ sprache: 'Deutsch', niveau: pick(['A1', 'A2', 'A2', 'B1']), art: 'Schulbildung CH', datum: reachDate!, bem: 'Integrationsklasse' });
      const bz = d(`01.08.${Math.max(2020, new Date(addMonths(p.zBeginn, 6) * 864e5).getUTCFullYear())}`);
      if (ageAtDay(p.birth, bz) >= 15 && bz < addMonths(M2, 1)) {
        p.courses.push({ art: 'Brückenangebot', bez: pick(['Berufsvorbereitendes Schuljahr (BVS)', 'Vorlehre Integration']), start: bz, end: addDays(addYears(bz, 1), -1), hours: 28, inst: 'Berufsfachschule Bern' });
        const after = addYears(bz, 1);
        if (after <= M2 && chance(0.55)) p.courses.push({ art: 'Sek II', bez: pick(['Lehre EBA Küchenangestellte/r', 'Lehre EFZ Fachfrau/Fachmann Gesundheit', 'Lehre EBA Logistiker/in', 'Lehre EFZ Detailhandel']), start: after, end: addYears(after, pick([2, 3])), hours: 40, inst: 'Lehrbetrieb' });
      }
    } else {
      const hrs = () => (p.highHours ? int(10, 20) : int(4, 9));
      p.lang.push({ sprache: 'Deutsch', niveau: 'A0', art: 'Einstufung', datum: addDays(p.zBeginn, int(5, 60)) });
      let t = start0;
      const until = reachDate ?? addMonths(entry, int(14, 40));
      let k = 0;
      while (t < until && t < M2 && k < 5) {
        const len = int(4, 8);
        const end = addMonths(t, len);
        p.courses.push({ art: p.latin ? 'Deutschkurs' : k === 0 ? 'Alphabetisierung' : 'Deutschkurs', bez: p.latin ? pick(['Deutsch A1', 'Deutsch A1 Intensiv', 'Deutsch A2', 'Deutsch A1 Prüfungsvorbereitung']) : k === 0 ? 'Deutsch Alpha' : 'Deutsch A1 langsam', start: t, end, hours: hrs(), inst: pick(['Bildungsinstitut Bern', 'ECAP Bern', 'Volkshochschule Bern', 'Caritas Bern']) });
        t = addMonths(end, int(1, 4));
        k++;
      }
      if (reachDate !== undefined) {
        p.lang.push({ sprache: 'Deutsch', niveau: weighted([['A1', 7], ['A2', 3]]), art: 'Zertifikat', datum: reachDate, bem: pick(['telc', 'fide']) });
      } else if (DQ.kursbest < 13 && chance(0.12) && addYears(entry, 3) < addMonths(M2, 12)) {
        DQ.kursbest++;
        p.lang.push({ sprache: 'Deutsch', niveau: 'A1', art: 'Kursbestätigung', datum: addMonths(entry, int(15, 30)), bem: 'Kurs besucht' });
      }
    }
    // ---------------- work (goal 2 groundwork) ----------------
    if (!teen && p.status !== 'S') {
      const workP = 0.25 + (p.workYears >= 5 ? 0.2 : p.workYears >= 1 ? 0.1 : 0) + (p.latin ? 0.15 : 0) + Math.min(0.3, yearsBetween(entry, M2) * 0.07) - (p.childcare ? 0.25 : 0);
      if (chance(workP)) {
        let t = addMonths(entry, int(12, 36));
        let n = 0;
        while (t < M2 && n < 3) {
          if (chance(0.12)) {
            const [ag, ort, bem] = pick(PROGRAMS);
            const end = addMonths(t, int(3, 12));
            p.jobs.push({ von: t, bis: end, ag, ort, pensum: pick([50, 80, 100]), status: 'unselbstständig', bem, noZemis: true });
            t = addMonths(end, int(1, 3));
            n++;
            continue;
          }
          const [ag, ort] = pick(EMPLOYERS);
          const pensum = weighted<number>([[20, 8], [40, 14], [50, 14], [60, 14], [80, 20], [100, 30]]);
          const open = chance(0.45);
          const end = open ? undefined : addMonths(t, int(2, 20));
          const selbst = chance(0.04);
          const job: Job = { von: t, bis: end && end < M2 ? end : end, ag, ort, pensum, status: selbst ? 'selbstständig' : 'unselbstständig', bem: pick([undefined, 'Festanstellung', 'befristet', 'Stundenlohn', 'Temporär']) };
          if (ag === 'Adecco') { job.zemisName = 'Adecco Hotel & Event Bern Personalberatung'; DQ.variants++; }
          else if (ag === '4 You Personal AG') { job.zemisName = '4 You Personal AG / Einsatzort Kanton Basel-Stadt, 5600 Lenzburg'; DQ.variants++; }
          else if (chance(0.06)) { job.zemisName = `${ag} / Einsatzort ${ort}`; DQ.variants++; }
          p.jobs.push(job);
          if (DQ.overlap < 11 && open && chance(0.3)) {
            const [ag2, ort2] = pick(EMPLOYERS);
            p.jobs.push({ von: addMonths(t, int(1, 4)), bis: addMonths(t, int(6, 12)), ag: ag2, ort: ort2, pensum: pick([20, 30, 40]), status: 'unselbstständig', bem: 'Nebenjob' });
            DQ.overlap++;
          }
          if (open || !end) break;
          t = addMonths(end, int(1, 6));
          n++;
        }
      }
    }
  }
  // ---------------- financial support (goal 3 groundwork) ----------------
  if (hh.persona) return;
  const start = Math.min(...hh.members.map((m) => m.zBeginn));
  const status = hh.members[0].status;
  if (status === 'N (Asylsuchende)' && chance(0.3)) {
    hh.fin.push({ art: 'Nothilfe', von: start });
    return;
  }
  // exit when adults' combined pensum >= 80 % for a while
  const adults = hh.members.filter((m) => m.role !== 'child');
  const jobs = adults.flatMap((a) => a.jobs.filter((j) => !j.noZemis));
  const strong = jobs.filter((j) => j.pensum >= 80).sort((a, b) => a.von - b.von)[0];
  const exitP = 0.65 - (hh.members.length >= 4 ? 0.25 : 0) - (adults.some((a) => a.childcare) ? 0.2 : 0);
  if (strong && chance(exitP)) {
    const exit = addMonths(strong.von, int(1, 3));
    if (exit < M2 && exit > start) {
      hh.fin.push({ art: 'Sozialhilfe', von: start, bis: addDays(exit, -1), grund: pick(['Aufnahme einer Erwerbstätigkeit', 'Erhöhtes Erwerbseinkommen']) });
      const back = strong.bis !== undefined ? addMonths(strong.bis, int(1, 3)) : undefined;
      if (back !== undefined && back > addDays(exit, 30) && back < M2 && chance(0.7)) {
        hh.fin.push({ art: 'Keine Unterstützung', von: exit, bis: addDays(back, -1) });
        hh.fin.push({ art: 'Sozialhilfe', von: back });
      } else hh.fin.push({ art: 'Keine Unterstützung', von: exit });
      return;
    }
  }
  hh.fin.push({ art: 'Sozialhilfe', von: start });
}

// ---------------- proven goals (Integrationszielerreichung) ----------------
function provenGoals(hh: HH) {
  for (const p of hh.members) {
    if (p.persona || p.entry === undefined || ['S', 'N (Asylsuchende)'].includes(p.status)) continue;
    if (ageAtDay(p.birth, M2) < 16) continue;
    const dl = addYears(p.entry, 3);
    const cert = p.lang
      .filter((l) => ['Zertifikat', 'Schulbildung CH'].includes(l.art) && l.niveau !== 'A0')
      .sort((a, b) => a.datum - b.datum)[0];
    const kohorte = new Date(p.zBeginn * 864e5).getUTCFullYear();
    if (cert && cert.datum <= dl && cert.datum < addDays(M2, -45)) {
      // recorded with a lag; a few are never recorded (claimable, planted)
      if (DQ.notRecorded < 4 && chance(0.06)) DQ.notRecorded++;
      else p.proven.push({ art: 'Sprache A1', datum: addDays(cert.datum, int(0, 40)), kohorte });
    }
  }
}

// ---------------- Situationsanalyse ground truth ----------------
function saTruth(hh: HH) {
  for (const p of hh.members) {
    if (p.role === 'child' && ageAtDay(p.birth, M2) < 16) continue;
    const base: Record<string, unknown> = {
      childcare_duty_without_care: p.childcare ? 'yes' : hh.members.some((m) => m.role === 'child' && ageAtDay(m.birth, M2) < 4) ? 'no' : 'not_stated',
      literate_mother_tongue: p.school >= 3 ? 'yes' : 'no',
      literate_latin_script: p.latin ? 'yes' : 'no',
      german_oral_level: pick(['A0', 'A0', 'A1']),
      understands_swiss_german: p.swissGerman ? 'yes' : 'no',
      learning_pace: weighted([['slow', p.latin ? 1 : 3], ['medium', 3], ['good', p.latin ? 3 : 1]]),
      health_limits_work: 'none',
      psychological_strain: chance(0.18) ? 'mentioned' : 'none_mentioned',
      availability_for_work_or_education: p.childcare ? 'partial' : weighted([['full', 6], ['partial', 3], ['none', 1]]),
      work_experience_years_origin: p.workYears,
      diplomas: ['Berufslehre', 'Mittelschule', 'Universität / Hochschule'].includes(p.ausbildung) ? 'yes' : 'no',
      ict_skills: weighted([['none', 3], ['basic', 5], ['good', 2]]),
      driving_licence: weighted([['no', 6], ['yes_not_recognised', 3], ['yes_recognised', 1]]),
      career_wish: pick(CAREERS),
      family_reunification_pending: chance(0.12) ? 'yes' : 'no',
      volunteer_network: chance(0.4) ? 'yes' : 'no',
      debts: chance(0.15) ? 'yes' : 'no',
      looking_for_housing: p.housing.some((h) => h.art === 'Kollektivunterkunft' && h.bis === undefined) ? 'yes' : 'no',
    };
    p.sa = { ...base, ...(p.sa ?? {}) };
  }
}

// ---------------- build world ----------------
buildPersonas();
const currentAt = (p: P, st: Day) => p.zBeginn <= st && (p.zEnde === undefined || p.zEnde >= st);
while (households.reduce((s, h) => s + h.members.filter((m) => currentAt(m, M2)).length, 0) < 640) randomHousehold();
for (let i = 0; i < 4; i++) randomHousehold(int(d('01.07.2026'), d('15.09.2026')), true);
for (const hh of households) lifeCourse(hh);
for (const hh of households) provenGoals(hh);
for (const hh of households) saTruth(hh);

// Health: exactly 9 with strong limits (group suppressed in patterns, k >= 10)
{
  const adults = households.flatMap((h) => h.members).filter((p) => p.sa && !p.persona);
  for (let i = 0; i < 9; i++) adults[int(0, adults.length - 1)].sa!.health_limits_work = 'strong';
  for (const p of adults) if (p.sa!.health_limits_work === 'none' && chance(0.12)) p.sa!.health_limits_work = 'some';
}

// ---------------- planted mess (data-quality demo) ----------------
const all = () => households.flatMap((h) => h.members);
const inScopeAdults = () => all().filter((p) => !p.persona && p.entry !== undefined && ['VA', 'F-FL', 'B-FL'].includes(p.status) && ageAtDay(p.birth, M2) >= 20);
{
  // 3 in-scope without entry event
  const c = inScopeAdults().filter((p) => p.zEnde !== undefined && p.zEnde > addMonths(M2, 3));
  for (let i = 0; i < 3; i++) {
    const p = c.splice(int(0, c.length - 1), 1)[0];
    p.hideEntry = true;
    DQ.noEntry++;
  }
  // 2 status mismatches (Klient says something else than the history)
  for (let i = 0; i < 2; i++) {
    const p = c.splice(int(0, c.length - 1), 1)[0];
    p.klientStatusOverride = p.status === 'VA' ? 'F-FL' : 'VA';
    DQ.statusMismatch++;
  }
  // 1 invalid period (Bis < Von) in Erwerb
  const withJob = all().filter((p) => !p.persona && p.jobs.some((j) => j.noZemis && j.bis !== undefined));
  const pj = withJob[int(0, withJob.length - 1)].jobs.find((j) => j.noZemis && j.bis !== undefined)!;
  pj.bis = addDays(pj.von, -30);
  DQ.invalid++;
  // ~9 ZEMIS jobs with no Erwerb row
  const adults = inScopeAdults().filter((p) => p.jobs.length === 0);
  for (let i = 0; i < 9; i++) {
    const p = adults[int(0, adults.length - 1)];
    const [ag, ort] = pick(EMPLOYERS.filter(([a]) => !['Adecco', '4 You Personal AG'].includes(a)));
    const von = int(addMonths(M2, -14), addMonths(M2, -3));
    p.jobs.push({ von, ag, ort, pensum: 80, status: 'unselbstständig', zemisOnly: true, zemisName: `${ag}, ${ort}` });
    DQ.zemisOnly++;
  }
}

// One household gets a new support period between the months, one ends support (month-2 differences)
{
  const sh = households.filter((h) => !h.persona && !h.newM2 && h.fin.length === 1 && h.fin[0].art === 'Sozialhilfe' && h.fin[0].bis === undefined && h.fin[0].von < M1);
  const ends = sh[0];
  ends.fin[0].bis = d('31.10.2026');
  ends.fin[0].grund = 'Aufnahme einer Erwerbstätigkeit';
  ends.fin.push({ art: 'Keine Unterstützung', von: d('01.11.2026') });
  const free = households.filter((h) => !h.persona && h.fin.length >= 2 && h.fin[h.fin.length - 1].art === 'Keine Unterstützung' && h.fin[h.fin.length - 1].bis === undefined && h.fin[h.fin.length - 1].von < M1);
  if (free[0]) {
    const last = free[0].fin[free[0].fin.length - 1];
    last.bis = d('31.10.2026');
    free[0].fin.push({ art: 'Sozialhilfe', von: d('01.11.2026') });
  }
}

// ---------------- export ----------------
type Cell = string | number | Date | null | undefined;
const asDate = (x: Day | undefined): Date | null => (x === undefined ? null : new Date(Date.UTC(1970, 0, 1 + x, 0, 0, 0)));
const asText = (x: Day | undefined): string | null => (x === undefined ? null : fmt(x));

/** Snapshot of the world as exported on Stichtag `st`: rows that started later are absent, later ends are still open. */
function cut<T extends { von?: Day; bis?: Day }>(rows: T[], st: Day): T[] {
  return rows.filter((r) => r.von === undefined || r.von <= st).map((r) => (r.bis !== undefined && r.bis > st ? { ...r, bis: undefined } : r));
}

async function writeTable(dir: string, table: TableId, rows: Cell[][], st: Day, headerOverride?: Record<string, string>) {
  const spec = TABLE_BY_ID[table];
  const wb = new ExcelJS.Workbook();
  wb.creator = 'ASD Fallführungssystem (SYNTHETISCH)';
  wb.created = new Date(Date.UTC(1970, 0, 1 + st, 6, 0, 0));
  wb.modified = wb.created;
  const ws = wb.addWorksheet('Tabelle1');
  ws.addRow(spec.columns.map((c) => headerOverride?.[c.header] ?? c.header));
  for (const r of rows) ws.addRow(r);
  spec.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(12, Math.min(40, c.header.length + 2));
    if (c.type === 'date') col.numFmt = 'dd.mm.yyyy';
  });
  ws.getRow(1).font = { bold: true };
  await wb.xlsx.writeFile(path.join(dir, spec.file));
}

async function exportMonth(st: Day, label: string) {
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });
  const hhs = households.filter((h) => Math.min(...h.members.map((m) => m.zBeginn)) <= st);
  // Export holds current clients plus those whose responsibility ended in the last 3 months (to show the filter).
  const persons = hhs.flatMap((h) => h.members.filter((m) => m.zBeginn <= st && (m.zEnde === undefined || m.zEnde >= addMonths(st, -3))).map((m) => ({ h, m })));
  const finOn = (h: HH) => cut(h.fin, st).find((f) => f.von <= st && (f.bis === undefined || f.bis >= st));
  // Klient (text dates, provisional headers)
  await writeTable(dir, 'klient', persons.map(({ h, m }) => {
    const statusNow = m.hist.filter((x) => x.von <= st).slice(-1)[0]?.status ?? m.status;
    return [
      m.knr, m.zemis, m.dossier, m.name, m.vorname, asText(m.zBeginn), asText(m.zEnde), asText(m.uebergang),
      m.klientStatusOverride ?? statusNow, finOn(h)?.art ?? null, h.sw, asText(m.birth), m.sex === 'w' ? 'weiblich' : 'männlich', m.origin.land,
      m.zivil, m.mutter, m.role === 'child' && ageAtDay(m.birth, st) < 16 ? 'keine' : m.ausbildung, m.role === 'child' ? null : m.school,
      m.role === 'child' && ageAtDay(m.birth, st) < 16 ? null : m.latin ? 'ja' : m.school < 3 ? 'nein – primärer Analphabetismus' : 'nein – andere Schrift', m.role === 'child' ? null : m.workYears,
    ];
  }), st);
  // Asylverfahrensstand (text dates)
  await writeTable(dir, 'asylverfahrensstand', persons.flatMap(({ m }) => cut(m.hist, st).map((x) => [m.zemis, m.knr, m.dossier, asText(x.von), asText(x.bis), x.status])), st);
  // Asylgeschäftsdaten (real dates)
  await writeTable(dir, 'asylgeschaeftsdaten', persons.flatMap(({ m }) => m.events.filter((e) => e.datum <= st && !(m.hideEntry && e.art === 'Aufenthalt (Einreise)')).map((e) => [Number(m.zemis), Number(m.knr), e.art, asDate(e.datum), e.erledigung ?? null, e.code ?? null, asDate(e.edatum)])), st);
  // Dossierperson
  await writeTable(dir, 'dossierperson', persons.map(({ m }) => [m.dossier, Number(m.knr), Number(m.zemis), asDate(m.zBeginn), null, 'Dossiermitglied', m.role === 'head' ? 'Dossierträger/-in' : m.role === 'spouse' ? 'Ehefrau / -mann' : m.role === 'child' ? 'Tochter / Sohn' : pick(['Geschwister', 'Cousin / Cousine', 'Onkel / Tante'])]), st);
  // Finanzielle Unterstützung (text dates, as in template '@' format)
  await writeTable(dir, 'finanz', hhs.flatMap((h) => cut(h.fin, st).map((f) => [h.dossier, f.art, asText(f.von), asText(f.bis), f.bis !== undefined ? (f.grund ?? null) : null])), st);
  // Unterbringung
  await writeTable(dir, 'unterbringung', persons.flatMap(({ m }) => cut(m.housing, st).map((x) => [Number(m.knr), asDate(x.von), asDate(x.bis), x.art, x.ort])), st);
  // Sprachstand (real dates; ZEMIS as text with apostrophe in some rows); header renamed in November (TI-03 demo)
  await writeTable(dir, 'sprachstand', persons.flatMap(({ m }) => m.lang.filter((l) => l.datum <= st).map((l, i) => [i % 3 === 0 ? `'${m.zemis}` : m.zemis, Number(m.knr), l.sprache, l.niveau, l.art, asDate(l.datum), l.bem ?? null])), st, st === M2 ? { Sprachniveau: 'Niveau (A0–C2)' } : undefined);
  // Integrationsförderung und Ausbildung
  await writeTable(dir, 'foerderung', persons.flatMap(({ m }) => m.courses.filter((c) => c.start <= st).map((c) => [m.zemis, Number(m.knr), asDate(c.start), asDate(c.end), c.art, c.bez, c.hours, c.inst, c.bem ?? null])), st);
  // Erwerb
  await writeTable(dir, 'erwerb', persons.flatMap(({ m }) => cut(m.jobs.filter((j) => !j.zemisOnly), st).map((j) => {
    const income = Math.round(j.pensum * 44 + int(-300, 300));
    return [Number(m.zemis), Number(m.knr), asDate(j.von), asDate(j.bis), j.ag, j.ort, j.pensum, j.status, income, chance(0.3) ? Math.round((income / (j.pensum * 1.8)) * 100) / 100 : null, chance(0.1) ? 'True' : 'False', chance(0.2) ? 'True' : 'False', j.bem ?? null];
  })), st);
  // ZEMIS Tätigkeit (first labour market only; name variants; planted rows without Erwerb)
  await writeTable(dir, 'zemis', persons.flatMap(({ m }) => cut(m.jobs.filter((j) => !j.noZemis && j.bem !== 'Nebenjob'), st).map((j) => [Number(m.zemis), Number(m.knr), asDate(addDays(j.von, j.zemisOnly ? 0 : int(0, 5))), asDate(j.bis), j.zemisName ?? j.ag])), st);
  // Integrationszielerreichung
  await writeTable(dir, 'zielerreichung', persons.flatMap(({ m }) => m.proven.filter((x) => x.datum <= st).map((x) => [m.zemis, x.art, asDate(x.datum), 'ASD Stadt Bern', x.kohorte, 'False'])), st);
  return { persons: persons.length, households: hhs.length };
}

async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  const a = await exportMonth(M1, '2026-10');
  const b = await exportMonth(M2, '2026-11');
  fs.mkdirSync(path.join(OUT, 'labels'), { recursive: true });
  const truth = households.map((h) => ({
    dossier: h.dossier,
    socialWorker: h.sw,
    newThisMonth: !!h.newM2,
    persona: h.persona ?? null,
    members: h.members.map((m) => ({
      zemis: m.zemis, klientNr: m.knr, vorname: m.vorname, name: m.name, sex: m.sex, birth: fmt(m.birth), role: m.role,
      nationality: m.origin.land, motherTongue: m.mutter, entry: fmt(m.entry), status: m.status, school: m.school, fields: m.sa ?? null,
      children: undefined,
    })),
  }));
  fs.writeFileSync(path.join(OUT, 'labels', 'situationsanalyse_truth.json'), JSON.stringify(truth, null, 1));
  fs.writeFileSync(path.join(OUT, 'README.txt'), `Synthetic data for the AI for Access hackathon (Integrations-Cockpit, ASD Stadt Bern).
NOT REAL PEOPLE. All names, numbers and stories are invented.

2026-10/  exports as of Stichtag 20.10.2026 (${a.persons} clients, ${a.households} households)
2026-11/  exports as of Stichtag 20.11.2026 (${b.persons} clients, ${b.households} households)
          In November the Sprachstand column "Sprachniveau" is exported as "Niveau (A0–C2)" (tests the column-mapping step).

Headers of Asylgeschäftsdaten, Asylverfahrensstand, Dossierperson, Erwerb, Finanzielle Unterstützung and
ZEMIS Tätigkeit are copied from ASD's templates. Klient, Sprachstand, Integrationsförderung und Ausbildung,
Unterbringung and Integrationszielerreichung follow the data model (templates not yet received).
Klient includes Name/Vorname columns (assumption: the real export has them).
Generated by scripts/generate.ts (seeded, deterministic).
`);
  fs.writeFileSync(path.join(OUT, 'planted_effects.md'), `# Planted effects (synthetic data)

We planted these effects on purpose, to test that the tool finds them. Real data will tell its own story.

## Goal 1 (A1 within 3 years), adults
Probability of reaching A1 = 0.55
 + 0.15 if literate in Latin script, − 0.25 if not
 − 0.20 childcare duty without daycare (women with children under 4: 70 %)
 + 0.12 if ≥ 10 course hours per week (drawn with 55 %, 25 % with childcare duty)
 + 0.10 if ≥ 9 school years before entry
 + 0.05 understands Swiss German
clipped to [0.04, 0.97]. Teenagers (13–19 at entry) 0.92 via Swiss schooling.
No direct gender effect: the gender gap runs through childcare.
10 % of those who reach it are late (37–50 months after entry).
"Strong health limits" given to exactly 9 people (group must be suppressed, k ≥ 10).

## Goal 2 / 3 groundwork
Work probability rises with work experience and literacy and with years since entry; falls with childcare.
Households leave social assistance when an adult has a job ≥ 80 %, less often for households ≥ 4 people or with childcare duty.

## Data-quality mess
- ${DQ.noEntry} in-scope clients without "Aufenthalt (Einreise)"
- ${DQ.kursbest + 1} A1 with "Kursbestätigung" (not accepted proof), incl. Yonas
- ${DQ.zemisOnly} ZEMIS jobs without Erwerb row
- ${DQ.variants} ZEMIS/Erwerb employer name variants that should match
- ${DQ.overlap} overlapping side jobs in Erwerb
- ${DQ.statusMismatch} Klient status ≠ Asylverfahrensstand
- ${DQ.invalid} Erwerb row with Bis before Von
- ${DQ.notRecorded} reached goals deliberately not recorded in Integrationszielerreichung (plus recent ones not yet recorded)
- children born in CH: ${all().filter((p) => p.bornInCH).length}
`);
  console.log(`2026-10: ${a.persons} clients / ${a.households} households`);
  console.log(`2026-11: ${b.persons} clients / ${b.households} households`);
  console.log('DQ planted:', DQ, 'bornInCH', all().filter((p) => p.bornInCH).length);
  console.log('SW caseloads:', Object.fromEntries(SOCIAL_WORKERS.map(([s]) => [s, all().filter((p) => households.find((h) => h.members.includes(p))!.sw === s).length])));
  console.log('generated', iso(M2));
}

main();
