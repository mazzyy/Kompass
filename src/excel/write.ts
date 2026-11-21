import ExcelJS from 'exceljs';
import { iso, toJsDate, type Day } from '../engine/dates';
import { TABLE_BY_ID } from '../engine/import/signatures';
import { BUCKETS, type Bucket, type GoalId, type GoalResult, type Person, type RunResult, type Status, type TotalsRow } from '../engine/model';
import { flattenRules } from '../engine/rules';
import { computePatterns } from '../engine/patterns';
import { bucketOf } from '../engine/totals';
import { msg } from '../i18n/messages';

export const APP_VERSION = '0.3.0';

export const STATUS_DE: Record<Status, string> = {
  reached: 'erreicht',
  on_track: 'auf Kurs',
  at_risk: 'gefährdet',
  missed: 'Frist verpasst',
  not_applicable: 'nicht anwendbar',
  no_data: 'nicht gezählt (Daten fehlen)',
};

const BUCKET_DE: Record<Bucket, string> = {
  reached_on_time: 'erreicht (rechtzeitig)',
  reached_late: 'erreicht (verspätet)',
  on_track: 'auf Kurs',
  at_risk: 'gefährdet',
  missed: 'Frist verpasst',
  no_data: 'nicht gezählt (Daten fehlen)',
  not_applicable: 'nicht anwendbar',
};

const FILL: Record<Status, { bg: string; fg: string }> = {
  reached: { bg: 'FFEAF5EE', fg: 'FF145F35' },
  on_track: { bg: 'FFFFF1B8', fg: 'FF5C4600' },
  at_risk: { bg: 'FFFDE3E1', fg: 'FFA3231A' },
  missed: { bg: 'FF7A1712', fg: 'FFFFFFFF' },
  not_applicable: { bg: 'FFEFEFEF', fg: 'FF5F5F5F' },
  no_data: { bg: 'FFEFEFEF', fg: 'FF5F5F5F' },
};

type Row = (string | number | Date | null | { formula: string; result: number })[];

function dateCell(d: Day | undefined): Date | null {
  return d === undefined ? null : toJsDate(d);
}

function addSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: Row[], widths?: number[]) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.addRow(headers);
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: 'FF1A1A1A' } };
  h.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE3E3E3' } };
  h.alignment = { vertical: 'middle', wrapText: true };
  for (const r of rows) ws.addRow(r);
  headers.forEach((hd, i) => {
    const col = ws.getColumn(i + 1);
    col.width = widths?.[i] ?? Math.max(10, Math.min(48, hd.length + 4));
  });
  // Real dates formatted dd.mm.yyyy (TE-04)
  ws.eachRow((row, rn) => {
    if (rn === 1) return;
    row.eachCell((cell) => {
      if (cell.value instanceof Date) cell.numFmt = 'dd.mm.yyyy';
    });
  });
  if (rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  return ws;
}

function colorStatus(ws: ExcelJS.Worksheet, col: number, statuses: (Status | undefined)[]) {
  statuses.forEach((s, i) => {
    if (!s) return;
    const cell = ws.getCell(i + 2, col);
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: FILL[s].bg } };
    cell.font = { color: { argb: FILL[s].fg }, bold: s === 'at_risk' || s === 'missed' };
  });
}

function sourcesText(r: GoalResult | undefined): string {
  if (!r) return '';
  const seen = new Set<string>();
  for (const t of r.trace) for (const s of t.sources) seen.add(`${TABLE_BY_ID[s.table].name} Z. ${s.row}`);
  return [...seen].join('; ');
}

function statusWord(r: GoalResult | undefined): string {
  if (!r) return '';
  return STATUS_DE[r.status] + (r.status === 'reached' && r.late ? ' (verspätet)' : '');
}

function personRows(persons: Person[], goal: GoalId): { rows: Row[]; statuses: Status[] } {
  const rows: Row[] = [];
  const statuses: Status[] = [];
  for (const p of persons) {
    const r = p.goals[goal]!;
    rows.push([
      p.klientNr,
      p.zemis,
      p.dossierNr,
      p.displayName,
      p.socialWorker,
      p.status,
      dateCell(p.birth),
      dateCell(p.entry),
      dateCell(r.deadline),
      statusWord(r),
      dateCell(r.reachedDate),
      r.status === 'reached' ? (r.late ? 'ja' : 'nein') : '',
      r.source === 'proven' ? 'belegt' : r.source === 'computed' ? 'berechnet' : '',
      msg('de', r.reason),
      r.trace.map((t) => msg('de', t.msg)).join(' · '),
      sourcesText(r),
      dateCell(r.status === 'reached' ? undefined : r.latestAction),
    ]);
    statuses.push(r.status);
  }
  return { rows, statuses };
}

const PERSON_HEADERS = [
  'Klientennummer',
  'Zemis Nummer',
  'Dossier-Nr.',
  'Name',
  'Fallführung',
  'Verfahrensstand',
  'Geburtsdatum',
  'Einreise',
  'Frist',
  'Status',
  'Erreicht am',
  'Verspätet',
  'Quelle (belegt/berechnet)',
  'Begründung',
  'Herleitung',
  'Quellenzeilen',
  'Spätester Handlungstermin',
];
const PERSON_WIDTHS = [14, 13, 12, 18, 14, 14, 12, 12, 12, 16, 12, 10, 14, 60, 70, 40, 16];

function householdSheet(wb: ExcelJS.Workbook, res: RunResult, sw?: string) {
  const byId = new Map(res.persons.map((p) => [p.id, p]));
  const hhs = res.households.filter((h) => h.goal3 && (!sw || h.socialWorker === sw));
  const rows: Row[] = hhs.map((h) => {
    const r = h.goal3!;
    const head = byId.get(h.head!)!;
    return [
      h.dossierNr,
      `${head.displayName} (${head.klientNr})`,
      h.members.length,
      h.socialWorker,
      dateCell(r.deadline),
      dateCell(r.status === 'reached' ? undefined : r.latestAction),
      statusWord(r),
      dateCell(r.reachedDate),
      r.status === 'reached' ? (r.late ? 'ja' : 'nein') : '',
      r.source === 'proven' ? 'belegt' : r.source === 'computed' ? 'berechnet' : '',
      msg('de', r.reason),
      r.trace.map((t) => msg('de', t.msg)).join(' · '),
      sourcesText(r),
    ];
  });
  const ws = addSheet(
    wb,
    'Ziel3_Haushalte',
    ['Dossier-Nr.', 'Dossierträger/-in', 'Personen', 'Fallführung', 'Frist', 'Spätestes Ende Sozialhilfe', 'Status', 'Erreicht am', 'Verspätet', 'Quelle (belegt/berechnet)', 'Begründung', 'Herleitung', 'Quellenzeilen'],
    rows,
    [12, 24, 9, 13, 12, 14, 16, 12, 10, 14, 60, 70, 40],
  );
  colorStatus(ws, 7, hhs.map((h) => h.goal3!.status));
}

function totalsRow(r: TotalsRow): Row {
  return [r.group, r.counted, ...BUCKETS.map((b) => r.counts[b]), r.total, r.rate === null ? null : Math.round(r.rate * 1000) / 10];
}

function overviewSheet(wb: ExcelJS.Workbook, res: RunResult) {
  const headers = ['Gruppe', 'In Ziel gezählt', ...BUCKETS.map((b) => BUCKET_DE[b]), 'Total', 'Zielerreichung %'];
  const rows: Row[] = [];
  const titleRows: number[] = [];
  for (const g of res.computedGoals) {
    const t = res.totals[g]!;
    const unit = t.unit === 'households' ? 'Haushalte' : 'Personen';
    const title = g === 1 ? 'Ziel 1 · Sprache A1 innert 3 Jahren' : g === 2 ? 'Ziel 2 · Arbeit / Ausbildung' : 'Ziel 3 · 12 Monate ohne Sozialhilfe';
    rows.push([`${title} (${unit})`]);
    titleRows.push(rows.length + 1);
    rows.push(totalsRow({ ...t.overall, group: 'Gesamt' }));
    // Reconciliation (TE-03): counts in the person sheet, as live formulas
    const sheet = g === 3 ? 'Ziel3_Haushalte' : `Ziel${g}_Personen`;
    const statusCol = g === 3 ? 'G' : 'J';
    const ctl: Row = ['Kontrolle: Zeilen im Blatt ' + sheet, null];
    for (const b of BUCKETS) {
      const word = b === 'reached_on_time' ? 'erreicht' : b === 'reached_late' ? 'erreicht (verspätet)' : BUCKET_DE[b];
      ctl.push({ formula: `COUNTIF('${sheet}'!${statusCol}:${statusCol},"${word}")`, result: t.overall.counts[b] });
    }
    ctl.push({ formula: `COUNTA('${sheet}'!A:A)-1`, result: t.overall.total });
    rows.push(ctl);
    rows.push(['Nach Fallführung']);
    titleRows.push(rows.length + 1);
    t.bySocialWorker.forEach((r) => rows.push(totalsRow(r)));
    rows.push(['Nach Einreisejahr']);
    titleRows.push(rows.length + 1);
    t.byEntryYear.forEach((r) => rows.push(totalsRow(r)));
    rows.push([]);
  }
  for (const n of res.notes) rows.push([msg('de', n)]);
  const ws = addSheet(wb, 'Übersicht', headers, rows, [40, 12, 14, 14, 10, 10, 12, 16, 14, 8, 14]);
  ws.autoFilter = undefined as unknown as ExcelJS.AutoFilter;
  for (const r of titleRows) ws.getRow(r).font = { bold: true };
}

function callRows(res: RunResult, sw?: string): Row[] {
  const rows: Row[] = [];
  const byId = new Map(res.persons.map((p) => [p.id, p]));
  const lists = sw ? { [sw]: res.callLists[sw] ?? [] } : res.callLists;
  for (const [s, items] of Object.entries(lists)) {
    items.forEach((c, i) => {
      const p = byId.get(c.personId)!;
      rows.push([
        i + 1,
        s,
        p.klientNr,
        p.displayName,
        ...res.computedGoals.map((g) => statusWord(p.goals[g])),
        msg('de', c.lead),
        dateCell(c.keyDate),
        c.reasons.filter((r) => JSON.stringify(r) !== JSON.stringify(c.lead)).map((r) => msg('de', r)).join(' · '),
        c.talkingPoints.map((t) => msg('de', t)).join(' · '),
        '',
      ]);
    });
  }
  return rows;
}

function callSheet(wb: ExcelJS.Workbook, res: RunResult, sw?: string) {
  const headers = ['Rang', 'Fallführung', 'Klientennummer', 'Name', ...res.computedGoals.map((g) => `Ziel ${g}`), 'Grund', 'Termin', 'Weitere Gründe', 'Gesprächspunkte', 'Angerufen'];
  const rows = callRows(res, sw);
  const ws = addSheet(wb, 'Anrufliste', headers, rows, [6, 13, 14, 18, ...res.computedGoals.map(() => 16), 60, 12, 50, 60, 11]);
  res.computedGoals.forEach((g, gi) => {
    const byId = new Map(res.persons.map((p) => [p.id, p]));
    const lists = sw ? [res.callLists[sw] ?? []] : Object.values(res.callLists);
    const sts = lists.flat().map((c) => byId.get(c.personId)!.goals[g]?.status);
    colorStatus(ws, 5 + gi, sts);
  });
}

function dqSheet(wb: ExcelJS.Workbook, res: RunResult, sw?: string) {
  const sev = { high: 'hoch', medium: 'mittel', info: 'Info' };
  const persons = new Map(res.persons.map((p) => [p.id, p]));
  const alerts = res.alerts.filter((a) => !sw || (a.personId && persons.get(a.personId)?.socialWorker === sw));
  const order = { high: 0, medium: 1, info: 2 };
  const rows: Row[] = [...alerts]
    .sort((a, b) => order[a.severity] - order[b.severity] || a.code.localeCompare(b.code))
    .map((a) => {
      const s = a.sources[0];
      return [
        sev[a.severity],
        a.code,
        msg('de', a.msg),
        a.personId ?? '',
        a.personId ? (persons.get(a.personId)?.socialWorker ?? '') : '',
        s ? TABLE_BY_ID[s.table].name : '',
        s ? s.row : null,
        s ? Object.entries(s.fields).map(([k, v]) => `${k}: ${v}`).join('; ') : '',
      ];
    });
  addSheet(wb, 'Datenqualität', ['Schwere', 'Code', 'Problem', 'Klientennummer', 'Fallführung', 'Tabelle', 'Zeile', 'Details'], rows, [10, 26, 70, 14, 13, 26, 8, 80]);
}

function claimSheet(wb: ExcelJS.Workbook, res: RunResult, lumpSums: Record<string, number | null>, sw?: string) {
  const byId = new Map(res.persons.map((p) => [p.id, p]));
  const list = res.claimable.filter((c) => !sw || byId.get(c.personId)?.socialWorker === sw);
  const goalName = { 1: 'Ziel 1 · Sprache A1', 2: 'Ziel 2 · Arbeit / Ausbildung', 3: 'Ziel 3 · Ohne Sozialhilfe (Haushalt)' };
  const rows: Row[] = list.map((c) => {
    const p = byId.get(c.personId)!;
    const chf = lumpSums[`goal${c.goal}`];
    return [
      goalName[c.goal],
      p.klientNr,
      p.zemis,
      p.dossierNr,
      p.displayName,
      p.socialWorker,
      dateCell(c.reachedDate),
      msg('de', c.reason),
      c.sources.map((s) => `${TABLE_BY_ID[s.table].name} Z. ${s.row}`).join('; '),
      chf ?? null,
    ];
  });
  addSheet(
    wb,
    'Abrechenbar',
    ['Ziel', 'Klientennummer', 'Zemis Nummer', 'Dossier-Nr.', 'Name', 'Fallführung', 'Erreicht am', 'Begründung', 'Quellenzeilen', 'Pauschale CHF (rules.yaml)'],
    rows,
    [30, 14, 13, 12, 18, 13, 12, 60, 40, 14],
  );
}

function whatIfSheet(wb: ExcelJS.Workbook, res: RunResult) {
  const w = res.whatIf;
  if (!w) return;
  const byId = new Map(res.persons.map((p) => [p.id, p]));
  const rows: Row[] = [
    [w.interpretation === 'B'
      ? `2027-Regel (Organisatoren): gilt für Einreisen ab 01.01.2027 (5 Jahre) und ist in allen Fristen eingerechnet. ${w.affected} heutige Klient:innen betroffen.`
      : `Simulation 2027-Regel, Auslegung ${w.interpretation}: ${w.affected} Klient:innen mit früherer Frist. Ziel 1 unverändert.`],
    ['Ab 1. Januar 2027 ist die Bundesabgeltung für alle Personen im Asyl- und Flüchtlingsbereich auf 5 Jahre begrenzt (Entlastungspaket 2027 des Bundes). Die Übergangsregeln des Kantons Bern können abweichen; einstellbar in rules.yaml.'],
    [],
    ['Veränderung je Status', 'Ziel 2 (Personen)', 'Ziel 3 (Haushalte)'],
    ...(['on_track', 'at_risk', 'missed'] as const).map((st) => [STATUS_DE[st], w.delta[2][st], w.delta[3][st]] as Row),
    [],
    ['Klientennummer', 'Name', 'Fallführung', 'Frist Ziel 2/3 heute', 'Frist Ziel 2/3 neu', 'Ziel 2 heute', 'Ziel 2 neu', 'Ziel 3 heute', 'Ziel 3 neu'],
    ...w.changes.map((c) => {
      const p = byId.get(c.personId)!;
      return [p.klientNr, p.displayName, p.socialWorker, dateCell(c.oldEnd), dateCell(c.newEnd), c.before[2] ? STATUS_DE[c.before[2]] : '', c.after[2] ? STATUS_DE[c.after[2]] : '', c.before[3] ? STATUS_DE[c.before[3]] : '', c.after[3] ? STATUS_DE[c.after[3]] : ''] as Row;
    }),
  ];
  const ws = addSheet(wb, 'WhatIf_2027', ['Was wäre wenn: 2027-Regel', '', '', '', '', '', '', '', ''], rows, [40, 18, 14, 16, 16, 16, 16, 16, 16]);
  ws.autoFilter = undefined as unknown as ExcelJS.AutoFilter;
}

function forecastSheet(wb: ExcelJS.Workbook, res: RunResult, lumpSums: Record<string, number | null>) {
  const v = (g: number) => (typeof lumpSums[`goal${g}`] === 'number' ? (lumpSums[`goal${g}`] as number) : null);
  const set = [1, 2, 3].every((g) => v(g) !== null);
  const chf = (a: number, b: number, c: number) => (set ? a * v(1)! + b * v(2)! + c * v(3)! : null);
  const rows: Row[] = res.forecast.map((q) => [q.label, q.goal1, q.goal2, q.goal3, q.goal1 + q.goal2 + q.goal3, chf(q.goal1, q.goal2, q.goal3)]);
  const by = (g: number) => res.claimable.filter((c) => c.goal === g).length;
  rows.push([], ['Jetzt abrechenbar (siehe Blatt Abrechenbar)', by(1), by(2), by(3), res.claimable.length, chf(by(1), by(2), by(3))]);
  if (set) rows.push(['Pauschalen pro erreichtem Ziel (rules.yaml)', v(1), v(2), v(3)]);
  rows.push([
    set
      ? 'Ziel 1: laufender Kurs endet vor der Frist (setzt bestandene Prüfung voraus). Ziel 2/3: Abschluss im Quartal. CHF = Anzahl × Pauschale aus dem Leistungsvertrag (in rules.yaml eingegeben).'
      : 'Ziel 1: laufender Kurs endet vor der Frist (setzt bestandene Prüfung voraus). Ziel 2/3: Abschluss im Quartal. Nur Anzahl; CHF erst mit Pauschalen in rules.yaml.',
  ]);
  const ws = addSheet(wb, 'Prognose', ['Quartal', 'Ziel 1', 'Ziel 2', 'Ziel 3 (Haushalte)', 'Total', 'CHF'], rows, [44, 10, 10, 16, 10, 14]);
  ws.autoFilter = undefined as unknown as ExcelJS.AutoFilter;
}

const FACTOR_DE: Record<string, string> = {
  latin: 'In lateinischer Schrift alphabetisiert',
  hours: 'Deutschkurs im 1. Jahr mit mindestens 10 Std./Woche',
  course6m: 'Kurs innert 6 Monaten nach Zuständigkeitsbeginn',
  childcare: 'Kinderbetreuung ohne Kita-Platz (Situationsanalyse, bestätigt)',
  health: 'Gesundheit schränkt Arbeit ein (Situationsanalyse, bestätigt)',
  school: 'Schuljahre vor Einreise',
  work: 'Jahre Arbeitserfahrung vor Einreise',
  age: 'Alter bei Einreise',
  gender: 'Geschlecht (Gleichbehandlung)',
  nationality: 'Nationalität',
};
const GROUP_DE: Record<string, string> = { yes: 'ja', no: 'nein', ge10: '≥ 10 Std.', lt10: '< 10 Std.', w: 'Frauen', m: 'Männer' };

function patternsSheet(wb: ExcelJS.Workbook, res: RunResult, minGroup: number) {
  const pr = computePatterns(res.persons, new Map(Object.entries(res.features)), res.stichtag, minGroup);
  const rows: Row[] = [[`Kohorte: ${pr.cohortSize} Klient:innen mit Ziel-1-Frist vor dem Stichtag; ${Math.round(pr.rate * 100)} % rechtzeitig erreicht. Nur Gruppen, nie ein Wert pro Person. Gruppen unter ${minGroup} ausgeblendet. Zusammenhänge, keine Ursachen.`], []];
  for (const f of pr.factors) {
    if (f.hidden) {
      rows.push([FACTOR_DE[f.id], '(ausgeblendet: Gruppe unter ' + minGroup + ' oder keine Angaben)']);
      continue;
    }
    for (const g of f.groups) rows.push([FACTOR_DE[f.id], GROUP_DE[g.label] ?? g.label, g.n, g.reached, Math.round(g.rate * 1000) / 10, Math.round(g.ci[0] * 1000) / 10, Math.round(g.ci[1] * 1000) / 10]);
  }
  const ws = addSheet(wb, 'Muster', ['Faktor', 'Gruppe', 'Personen', 'Erreicht', 'Quote %', '95 % von', '95 % bis'], rows, [56, 22, 10, 10, 10, 10, 10]);
  ws.autoFilter = undefined as unknown as ExcelJS.AutoFilter;
}

function rulesSheet(wb: ExcelJS.Workbook, rulesText: string) {
  const rows: Row[] = flattenRules(rulesText).map((r) => [r.path, r.value, r.note]);
  addSheet(wb, 'Regeln', ['Einstellung', 'Wert', 'Hinweis'], rows, [42, 60, 60]);
}

function runSheet(wb: ExcelJS.Workbook, res: RunResult, createdIso: string) {
  const rows: Row[] = [
    ['Stichtag', toJsDate(res.stichtag)],
    ['Regeln-Version', res.rulesVersion],
    ['App-Version', APP_VERSION],
    ['Erstellt', createdIso],
    ['Berechnete Ziele', res.computedGoals.join(', ')],
    ['Fehlende Tabellen', res.missingTables.map((t) => TABLE_BY_ID[t].name).join(', ') || '–'],
    ['Datenschutz', 'Gebaut für das kantonale Datenschutzgesetz Bern (KDSG): läuft auf einem Computer, keine Cloud, Namen und Nummern werden vor dem KI-Schritt entfernt, Gruppen unter 10 werden ausgeblendet.'],
    ['Daten', 'SYNTHETISCHE Beispieldaten, sofern die Beispieldateien verwendet wurden. Keine echten Personen.'],
    [],
    ['Eingabedatei', 'Tabelle', 'Zeilen'],
    ...res.inputs.map((i) => [i.fileName, i.table ? TABLE_BY_ID[i.table].name : 'nicht erkannt', i.rows] as Row),
    [],
    ...res.notes.map((n) => ['Hinweis', msg('de', n)] as Row),
  ];
  const ws = addSheet(wb, 'Lauf', ['Feld', 'Wert', ''], rows, [28, 60, 10]);
  ws.autoFilter = undefined as unknown as ExcelJS.AutoFilter;
}

export interface OutFile {
  name: string;
  audience: string; // 'management' or social worker name
  sheets: string[];
  buffer: ArrayBuffer;
}

function newWb(res: RunResult): ExcelJS.Workbook {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Integrations-Cockpit';
  wb.created = toJsDate(res.stichtag);
  wb.modified = toJsDate(res.stichtag);
  return wb;
}

export async function writeManagement(res: RunResult, rulesText: string, createdIso = '', lumpSums: Record<string, number | null> = {}): Promise<OutFile> {
  const wb = newWb(res);
  overviewSheet(wb, res);
  for (const g of res.computedGoals) {
    if (g === 3) {
      householdSheet(wb, res);
      continue;
    }
    const { rows, statuses } = personRows(res.persons, g);
    const ws = addSheet(wb, `Ziel${g}_Personen`, PERSON_HEADERS, rows, PERSON_WIDTHS);
    colorStatus(ws, 10, statuses);
  }
  callSheet(wb, res);
  claimSheet(wb, res, lumpSums);
  patternsSheet(wb, res, 10);
  dqSheet(wb, res);
  forecastSheet(wb, res, lumpSums);
  whatIfSheet(wb, res);
  rulesSheet(wb, rulesText);
  runSheet(wb, res, createdIso);
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  return { name: `Kompass_${iso(res.stichtag)}.xlsx`, audience: 'management', sheets: wb.worksheets.map((w) => w.name), buffer };
}

export async function writeSocialWorker(res: RunResult, sw: string, rulesText: string): Promise<OutFile> {
  const wb = newWb(res);
  callSheet(wb, res, sw);
  const mine = res.persons.filter((p) => p.socialWorker === sw);
  const headers = ['Klientennummer', 'Zemis Nummer', 'Dossier-Nr.', 'Name', 'Verfahrensstand', 'Einreise', ...res.computedGoals.flatMap((g) => [`Ziel ${g} Status`, `Ziel ${g} Frist`, `Ziel ${g} Begründung`])];
  const rows: Row[] = mine.map((p) => [
    p.klientNr,
    p.zemis,
    p.dossierNr,
    p.displayName,
    p.status,
    dateCell(p.entry),
    ...res.computedGoals.flatMap((g) => [statusWord(p.goals[g]), dateCell(p.goals[g]?.latestAction ?? p.goals[g]?.deadline), msg('de', p.goals[g]?.reason)]),
  ]);
  const ws = addSheet(wb, 'Meine_Klienten', headers, rows, [14, 13, 12, 18, 14, 12, ...res.computedGoals.flatMap(() => [16, 12, 60])]);
  res.computedGoals.forEach((g, gi) => colorStatus(ws, 7 + gi * 3, mine.map((p) => p.goals[g]?.status)));
  dqSheet(wb, res, sw);
  rulesSheet(wb, rulesText);
  const buffer = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
  const safe = sw.replace(/[^A-Za-z0-9äöüÄÖÜ]+/g, '_').replace(/_+$/, '');
  return { name: `Anrufliste_${safe}_${iso(res.stichtag)}.xlsx`, audience: sw, sheets: wb.worksheets.map((w) => w.name), buffer };
}

export async function writeAll(res: RunResult, rulesText: string, createdIso = '', lumpSums: Record<string, number | null> = {}): Promise<OutFile[]> {
  const out = [await writeManagement(res, rulesText, createdIso, lumpSums)];
  for (const sw of res.socialWorkers) out.push(await writeSocialWorker(res, sw, rulesText));
  return out;
}

export { bucketOf };
