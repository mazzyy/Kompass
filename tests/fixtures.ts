import { d, fmt, type Day } from '../src/engine/dates';
import { defaultRules } from '../src/engine/defaultRules';
import { analyzeFiles, parseTables, type RawTable } from '../src/engine/import/detect';
import { TABLE_BY_ID, type TableId } from '../src/engine/import/signatures';
import type { Rules } from '../src/engine/rules';
import { run } from '../src/engine/run';

export const ST = d('20.11.2026');

type Row = Record<string, unknown>;

/** Builds raw tables with the real German headers, so tests also go through import + parsing. */
export class Fx {
  t: Partial<Record<TableId, Row[]>> = {};
  add(table: TableId, row: Row) {
    (this.t[table] ??= []).push(row);
    return this;
  }
  raws(): RawTable[] {
    return (Object.entries(this.t) as [TableId, Row[]][]).map(([id, rows]) => {
      const spec = TABLE_BY_ID[id];
      return {
        fileName: `${id}.xlsx`,
        sheetName: 'Tabelle1',
        headers: spec.columns.map((c) => c.header),
        rows: rows.map((r) => spec.columns.map((c) => (r[c.key] === undefined ? null : r[c.key]))),
      };
    });
  }
  /** Ensure the goal-1 tables exist even when empty. */
  withTables(...ids: TableId[]) {
    for (const id of ids) this.t[id] ??= [];
    return this;
  }
  run(rules: Rules = defaultRules(), st: Day = ST) {
    const raws = this.raws();
    const an = analyzeFiles(raws);
    const parsed = parseTables(raws, an);
    return run({ parsed, rules, stichtag: st });
  }
}

let seq = 0;
export interface PersonSpec {
  knr?: string;
  zemis?: string;
  dossier?: string;
  status?: string;
  birth?: string;
  entry?: string | null; // null = no entry event
  birthEvent?: boolean;
  ze?: string;
  zb?: string;
  uebergang?: string;
  sw?: string;
  muttersprache?: string;
  name?: string;
  vorname?: string;
}

export function addPerson(fx: Fx, s: PersonSpec = {}) {
  seq++;
  const knr = s.knr ?? String(20000 + seq);
  const zemis = s.zemis ?? String(30000000 + seq);
  fx.add('klient', {
    klientNr: knr,
    zemis,
    dossierNr: s.dossier ?? `D12.${5000 + seq}`,
    name: s.name,
    vorname: s.vorname,
    zBeginn: s.zb ?? '01.01.2024',
    zEnde: s.ze ?? '31.12.2030',
    uebergang: s.uebergang,
    status: s.status ?? 'VA',
    fallfuehrung: s.sw ?? 'S. Keller',
    geburtsdatum: s.birth ?? '01.01.1990',
    muttersprache: s.muttersprache ?? 'Tigrinya',
  });
  if (s.entry !== null) fx.add('asylgeschaeftsdaten', { zemis, klientNr: knr, art: 'Aufenthalt (Einreise)', datum: s.entry ?? '01.01.2024' });
  if (s.birthEvent) fx.add('asylgeschaeftsdaten', { zemis, klientNr: knr, art: 'Aufenthalt (Geburt)', datum: s.birth ?? '01.01.2015' });
  fx.withTables('sprachstand', 'asylgeschaeftsdaten', 'foerderung', 'zielerreichung', 'erwerb');
  return { knr, zemis };
}

export const lang = (fx: Fx, p: { knr: string; zemis: string }, niveau: string, art: string, datum: string, sprache = 'Deutsch', bemerkungen?: string) =>
  fx.add('sprachstand', { zemis: p.zemis, klientNr: p.knr, sprache, niveau, art, datum, bemerkungen });

export const course = (fx: Fx, p: { knr: string; zemis: string }, art: string, bezeichnung: string, start: string, abschluss?: string, stunden = 12) =>
  fx.add('foerderung', { zemis: p.zemis, klientNr: p.knr, art, bezeichnung, start, abschluss, stunden });

export const job = (fx: Fx, p: { knr: string; zemis: string }, von: string, pensum: number, bis?: string, extra: Record<string, unknown> = {}) =>
  fx.add('erwerb', { zemis: p.zemis, klientNr: p.knr, von, bis, pensum, arbeitgeber: 'Firma AG', erwerbsstatus: 'unselbstständig', ...extra });

export const support = (fx: Fx, dossier: string, art: string, von: string, bis?: string) => fx.add('finanz', { dossierNr: dossier, art, von, bis });

export const g = (res: ReturnType<Fx['run']>, knr: string) => {
  const p = res.persons.find((x) => x.klientNr === knr);
  if (!p) throw new Error(`person ${knr} not in result`);
  return p;
};

export { fmt };
