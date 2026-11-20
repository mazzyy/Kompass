import * as XLSX from 'xlsx';
import { parseDate } from '../dates';
import type { RawTable } from './detect';

/** Read the first sheet of an .xlsx/.xls/.csv file into a RawTable. Dates stay raw (serials or text). */
export function readWorkbook(data: ArrayBuffer | Uint8Array, fileName: string, lastModified?: number): RawTable {
  const wb = XLSX.read(data, { type: 'array', cellDates: false, cellText: false });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: null, blankrows: true });
  // Header row = first row with at least 2 non-empty cells.
  let h = 0;
  while (h < aoa.length && (aoa[h] ?? []).filter((c) => c !== null && String(c).trim() !== '').length < 2) h++;
  const headers = (aoa[h] ?? []).map((c) => (c === null ? '' : String(c)));
  const rows = aoa.slice(h + 1).map((r) => {
    const row = [...(r ?? [])];
    while (row.length < headers.length) row.push(null);
    return row;
  });
  const props = wb.Props as { ModifiedDate?: Date | string; CreatedDate?: Date | string } | undefined;
  let modified = props?.ModifiedDate ? parseDate(new Date(props.ModifiedDate as string)) : undefined;
  if (modified === undefined && lastModified) {
    const dt = new Date(lastModified);
    modified = parseDate(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()));
  }
  return { fileName, sheetName, headers, rows, modified, headerRow: h + 1 };
}
