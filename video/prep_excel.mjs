// First rows of the 11 synthetic November exports, for the "problem" scene.
import fs from 'node:fs';
import XLSX from 'xlsx';
const dir = 'sample-data/2026-11';
const out = fs.readdirSync(dir).filter((f) => f.endsWith('.xlsx')).map((f) => {
  const wb = XLSX.read(fs.readFileSync(`${dir}/${f}`), { cellDates: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, blankrows: false }).slice(0, 9);
  return { name: f.replace(/^Hackathon_|_Resultat\.xlsx$/g, '').replace(/_/g, ' '), rows: rows.map((r) => r.slice(0, 6).map((c) => (c == null || String(c) === 'null' ? '' : String(c).slice(0, 22)))) };
});
fs.writeFileSync('video/excel.json', JSON.stringify(out));
console.log(out.map((t) => t.name).join(' | '));
