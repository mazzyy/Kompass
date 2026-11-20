import { parseDate, type Day } from '../dates';
import { TABLES, TABLE_BY_ID, type ColSpec, type TableId, type TableSpec } from './signatures';
import { TEMPLATE_VALUES } from './templateValues';

/** One sheet as read from an uploaded file (header row + data rows, raw cell values). */
export interface RawTable {
  fileName: string;
  sheetName: string;
  headers: unknown[];
  rows: unknown[][];
  modified?: Day; // file / workbook modification date, used as default Stichtag
  headerRow?: number; // Excel row number of the header (default 1)
}

export function normHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/[   ]/g, ' ')
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9%]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Keys: string, no spaces, no leading apostrophe; numbers without decimals. */
export function normKey(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.trunc(v));
  return String(v)
    .replace(/[ \s]/g, '')
    .replace(/^'+/, '')
    .replace(/\.0+$/, '');
}

function bigrams(s: string): Map<string, number> {
  const m = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i++) {
    const b = t.slice(i, i + 2);
    m.set(b, (m.get(b) ?? 0) + 1);
  }
  return m;
}

/** Dice similarity on character bigrams, 0..1. */
export function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  let inter = 0;
  let total = 0;
  for (const [k, v] of A) {
    inter += Math.min(v, B.get(k) ?? 0);
    total += v;
  }
  for (const v of B.values()) total += v;
  return (2 * inter) / total;
}

/** Header similarity with a bonus when one header's words are contained in the other's. */
export function headerSimilarity(expected: string, actual: string): number {
  const e = normHeader(expected);
  const a = normHeader(actual);
  let s = similarity(e, a);
  const ew = e.split(' ');
  const aw = a.split(' ');
  for (const w of aw) if (w.length >= 4 && ew.some((x) => x.includes(w) || w.includes(x))) s = Math.max(s, 0.6);
  return s;
}

function profileOk(profile: ColSpec['profile'], values: unknown[]): boolean | undefined {
  if (!profile) return undefined;
  const vals = values.filter((v) => v !== null && v !== undefined && String(v).trim() !== '').slice(0, 50);
  if (!vals.length) return undefined;
  const test = (v: unknown): boolean => {
    const s = String(v).trim();
    switch (profile) {
      case 'level':
        return /^[ABC][0-2]/i.test(s);
      case 'date':
        return parseDate(v) !== undefined;
      case 'percent':
        return !isNaN(Number(s.replace('%', ''))) && Number(s.replace('%', '')) >= 0 && Number(s.replace('%', '')) <= 100;
      case 'zemis':
        return /^\d{8}$/.test(normKey(v));
      case 'klientnr':
        return /^\d{4,6}$/.test(normKey(v));
      case 'dossier':
        return /^D\d+\.\d+$/i.test(normKey(v));
    }
    return false;
  };
  return vals.filter(test).length / vals.length >= 0.8;
}

export interface MappingSuggestion {
  table: TableId;
  colKey: string;
  expectedHeader: string;
  fileHeader: string;
  fileIndex: number;
  score: number;
  samples: string[];
  profileOk?: boolean;
  required: boolean;
  /** 'rules' = header + value profile; 'ai' = local model ranked it (set by the UI when used) */
  suggestedBy: 'rules' | 'ai';
}

export interface FileAnalysis {
  fileName: string;
  sheetName: string;
  table?: TableId;
  score: number;
  rows: number;
  modified?: Day;
  /** colKey -> column index in the file */
  mapping: Record<string, number>;
  missingColumns: { colKey: string; header: string; required: boolean }[];
  suggestions: MappingSuggestion[];
  status: 'ok' | 'mapped' | 'needs_confirmation' | 'missing_required' | 'unknown' | 'duplicate';
  extraHeaders: string[];
}

export type SavedMappings = Record<string, string>; // `${table}::${normHeader}` -> colKey

export const mappingKey = (table: TableId, header: string) => `${table}::${normHeader(header)}`;

function headerMatchesCol(nh: string, col: ColSpec): boolean {
  return normHeader(col.header) === nh || (col.alts ?? []).some((a) => normHeader(a) === nh);
}

function scoreTable(spec: TableSpec, nheaders: string[], saved: SavedMappings): number {
  const cols = spec.columns;
  let matchedCols = 0;
  const usedHeaders = new Set<number>();
  for (const col of cols) {
    const idx = nheaders.findIndex(
      (h, i) => !usedHeaders.has(i) && (headerMatchesCol(h, col) || saved[`${spec.id}::${h}`] === col.key),
    );
    if (idx >= 0) {
      matchedCols++;
      usedHeaders.add(idx);
    }
  }
  const recall = matchedCols / cols.length;
  const precision = nheaders.filter((h) => h).length ? usedHeaders.size / nheaders.filter((h) => h).length : 0;
  if (!recall || !precision) return 0;
  return (2 * recall * precision) / (recall + precision);
}

export function analyzeFile(raw: RawTable, saved: SavedMappings = {}): FileAnalysis {
  const nheaders = raw.headers.map(normHeader);
  const rows = raw.rows.filter((r) => r.some((c) => c !== null && c !== undefined && String(c).trim() !== ''));
  let best: TableSpec | undefined;
  let bestScore = 0;
  for (const spec of TABLES) {
    const s = scoreTable(spec, nheaders, saved);
    if (s > bestScore) {
      bestScore = s;
      best = spec;
    }
  }
  const base: FileAnalysis = {
    fileName: raw.fileName,
    sheetName: raw.sheetName,
    score: bestScore,
    rows: rows.length,
    modified: raw.modified,
    mapping: {},
    missingColumns: [],
    suggestions: [],
    status: 'unknown',
    extraHeaders: [],
  };
  if (!best || bestScore < 0.5) return base;
  const spec = best;
  base.table = spec.id;
  const used = new Set<number>();
  let usedSaved = false;
  for (const col of spec.columns) {
    let idx = nheaders.findIndex((h, i) => !used.has(i) && headerMatchesCol(h, col));
    if (idx < 0) {
      idx = nheaders.findIndex((h, i) => !used.has(i) && h && saved[`${spec.id}::${h}`] === col.key);
      if (idx >= 0) usedSaved = true;
    }
    if (idx >= 0) {
      base.mapping[col.key] = idx;
      used.add(idx);
    }
  }
  for (const col of spec.columns) {
    if (base.mapping[col.key] !== undefined) continue;
    // Suggest the best unused header for this column.
    let cand: MappingSuggestion | undefined;
    nheaders.forEach((h, i) => {
      if (used.has(i) || !h) return;
      const values = rows.map((r) => r[i]);
      const p = profileOk(col.profile, values);
      const sim = headerSimilarity(col.header, String(raw.headers[i]));
      const score = p === undefined ? sim : 0.5 * sim + 0.5 * (p ? 1 : 0);
      if (score >= 0.45 && (!cand || score > cand.score)) {
        cand = {
          table: spec.id,
          colKey: col.key,
          expectedHeader: col.header,
          fileHeader: String(raw.headers[i]),
          fileIndex: i,
          score,
          samples: values
            .filter((v) => v !== null && v !== undefined && String(v).trim() !== '')
            .slice(0, 5)
            .map((v) => String(v)),
          profileOk: p,
          required: !!col.required,
          suggestedBy: 'rules',
        };
      }
    });
    if (cand) base.suggestions.push(cand);
    else base.missingColumns.push({ colKey: col.key, header: col.header, required: !!col.required });
  }
  base.extraHeaders = raw.headers.filter((_, i) => !used.has(i) && normHeader(raw.headers[i])).map(String);
  if (base.suggestions.some((s) => s.required)) base.status = 'needs_confirmation';
  else if (base.missingColumns.some((m) => m.required)) base.status = 'missing_required';
  else base.status = usedSaved ? 'mapped' : 'ok';
  return base;
}

export function analyzeFiles(raws: RawTable[], saved: SavedMappings = {}): FileAnalysis[] {
  const res = raws.map((r) => analyzeFile(r, saved));
  const seen = new Set<TableId>();
  for (const a of res) {
    if (!a.table) continue;
    if (seen.has(a.table)) a.status = 'duplicate';
    seen.add(a.table);
  }
  return res;
}

export function acceptSuggestion(saved: SavedMappings, s: MappingSuggestion): SavedMappings {
  return { ...saved, [mappingKey(s.table, s.fileHeader)]: s.colKey };
}

// ---------- typed records ----------

export interface Rec {
  _table: TableId;
  _row: number; // Excel row number (header = row 1)
  [k: string]: unknown;
}

export interface UnknownValue {
  table: TableId;
  column: string;
  value: string;
  rows: number[];
}

export interface ParsedTables {
  tables: Partial<Record<TableId, Rec[]>>;
  unknownValues: UnknownValue[];
  badDates: { table: TableId; column: string; value: string; row: number }[];
}

function toBool(v: unknown): boolean | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'boolean') return v;
  const s = String(v).trim().toLowerCase();
  if (['true', 'ja', 'yes', '1', 'wahr', 'x'].includes(s)) return true;
  if (['false', 'nein', 'no', '0', 'falsch'].includes(s)) return false;
  return undefined;
}

function toNumber(v: unknown): number | undefined {
  if (v === null || v === undefined || v === '') return undefined;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/'/g, '').replace('%', '').replace(',', '.').trim());
  return isNaN(n) ? undefined : n;
}

function toStr(v: unknown): string | undefined {
  if (v === null || v === undefined) return undefined;
  const s = String(v).replace(/ /g, ' ').trim();
  return s === '' ? undefined : s;
}

export function parseTables(raws: RawTable[], analyses: FileAnalysis[]): ParsedTables {
  const out: ParsedTables = { tables: {}, unknownValues: [], badDates: [] };
  const unknown = new Map<string, UnknownValue>();
  raws.forEach((raw, fi) => {
    const a = analyses[fi];
    if (!a.table || a.status === 'duplicate' || a.status === 'unknown' || a.status === 'needs_confirmation') return;
    const spec = TABLE_BY_ID[a.table];
    const recs: Rec[] = [];
    raw.rows.forEach((row, ri) => {
      if (!row.some((c) => c !== null && c !== undefined && String(c).trim() !== '')) return;
      const rowNo = (raw.headerRow ?? 1) + ri + 1;
      const rec: Rec = { _table: spec.id, _row: rowNo };
      for (const col of spec.columns) {
        const idx = a.mapping[col.key];
        if (idx === undefined) continue;
        const v = row[idx];
        switch (col.type) {
          case 'key':
            rec[col.key] = normKey(v);
            break;
          case 'date': {
            const dd = parseDate(v);
            rec[col.key] = dd;
            if (dd === undefined && toStr(v) !== undefined)
              out.badDates.push({ table: spec.id, column: col.header, value: String(v), row: rowNo });
            break;
          }
          case 'number':
            rec[col.key] = toNumber(v);
            break;
          case 'bool':
            rec[col.key] = toBool(v);
            break;
          default:
            rec[col.key] = toStr(v);
        }
        if (col.values && rec[col.key] !== undefined) {
          const allowed = TEMPLATE_VALUES[col.values];
          const val = String(rec[col.key]);
          if (allowed && !allowed.includes(val)) {
            const k = `${spec.id}|${col.header}|${val}`;
            const u = unknown.get(k) ?? { table: spec.id, column: col.header, value: val, rows: [] };
            u.rows.push(rowNo);
            unknown.set(k, u);
          }
        }
      }
      recs.push(rec);
    });
    out.tables[spec.id] = recs;
  });
  out.unknownValues = [...unknown.values()];
  return out;
}

export function runBlocked(analyses: FileAnalysis[]): boolean {
  return analyses.some((a) => a.status === 'needs_confirmation');
}
