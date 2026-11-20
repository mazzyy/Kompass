import type { Day } from './dates';
import type { ParsedTables, Rec } from './import/detect';
import type { TableId } from './import/signatures';
import type { Rules } from './rules';

export interface PersonKey {
  zemis: string;
  klientNr: string;
}

export class Ctx {
  rules: Rules;
  st: Day;
  tables: Partial<Record<TableId, Rec[]>>;
  private idx = new Map<TableId, { byZemis: Map<string, Rec[]>; byKnr: Map<string, Rec[]>; byDossier: Map<string, Rec[]> }>();

  constructor(parsed: ParsedTables, rules: Rules, st: Day) {
    this.rules = rules;
    this.st = st;
    this.tables = parsed.tables;
    for (const [t, recs] of Object.entries(parsed.tables) as [TableId, Rec[]][]) {
      const byZemis = new Map<string, Rec[]>();
      const byKnr = new Map<string, Rec[]>();
      const byDossier = new Map<string, Rec[]>();
      for (const r of recs) {
        const z = r.zemis as string | undefined;
        const k = r.klientNr as string | undefined;
        const dn = r.dossierNr as string | undefined;
        if (z) push(byZemis, z, r);
        else if (k) push(byKnr, k, r);
        if (dn) push(byDossier, dn, r);
      }
      this.idx.set(t, { byZemis, byKnr, byDossier });
    }
  }

  has(t: TableId): boolean {
    return this.tables[t] !== undefined;
  }

  /** Rows of a person table: join on ZEMIS where the row has it, else Klientennummer. */
  rowsFor(t: TableId, p: PersonKey): Rec[] {
    const i = this.idx.get(t);
    if (!i) return [];
    const a = p.zemis ? (i.byZemis.get(p.zemis) ?? []) : [];
    const b = p.klientNr ? (i.byKnr.get(p.klientNr) ?? []) : [];
    // Rows with a ZEMIS number but matching only by Klientennummer (e.g. Unterbringung has no ZEMIS)
    return b.length ? [...a, ...b] : a;
  }

  rowsForDossier(t: TableId, dossierNr: string): Rec[] {
    return this.idx.get(t)?.byDossier.get(dossierNr) ?? [];
  }
}

function push<K, V>(m: Map<K, V[]>, k: K, v: V) {
  const a = m.get(k);
  if (a) a.push(v);
  else m.set(k, [v]);
}

export const includesAny = (text: unknown, words: string[]): string | undefined => {
  const s = String(text ?? '').toLowerCase();
  if (!s) return undefined;
  return words.find((w) => s.includes(w.toLowerCase()));
};
