import { addYears, ageAt, fmt, parseDate, type Day } from './dates';
import type { Ctx } from './context';
import type { Rec } from './import/detect';
import { TEMPLATE_VALUES } from './import/templateValues';
import { day, srcRef, str, type Alert, type Msg, type Person } from './model';

/** Is the Klient row a current client at the Stichtag (§1)? */
export function isCurrent(k: Rec, ctx: Ctx): boolean {
  const { st, rules } = ctx;
  const ze = day(k.zEnde);
  const ue = day(k.uebergang);
  if (rules.population.require_open_responsibility && ze !== undefined && ze < st) return false;
  if (rules.population.exclude_handed_over && ue !== undefined && ue <= st) return false;
  return true;
}

export function buildPerson(k: Rec, ctx: Ctx, alerts: Alert[]): Person {
  const zemis = str(k.zemis);
  const klientNr = str(k.klientNr);
  const key = { zemis, klientNr };
  // Current status: Asylverfahrensstand row valid on Stichtag, else Klient.
  const hist = ctx.rowsFor('asylverfahrensstand', key).filter((r) => {
    const von = day(r.von);
    const bis = day(r.bis);
    return von !== undefined && von <= ctx.st && (bis === undefined || bis >= ctx.st);
  });
  hist.sort((a, b) => (day(b.von) ?? 0) - (day(a.von) ?? 0));
  const statusKlient = str(k.status) || undefined;
  let status = statusKlient ?? '';
  if (hist.length && str(hist[0].status)) {
    status = str(hist[0].status);
    if (statusKlient && statusKlient !== status) {
      alerts.push({
        code: 'status_mismatch',
        severity: 'medium',
        personId: klientNr || zemis,
        msg: { key: 'dq.status_mismatch', p: { klient: statusKlient, hist: status } },
        sources: [srcRef(k, ['klientNr', 'zemis', 'status']), srcRef(hist[0], ['status', 'von', 'bis'])],
      });
    }
  }
  const events = ctx.rowsFor('asylgeschaeftsdaten', key);
  const entries = events
    .filter((e) => str(e.art) === ctx.rules.goal1.entry_event && day(e.datum) !== undefined)
    .map((e) => day(e.datum)!)
    .sort((a, b) => a - b);
  const entry = entries[0];
  const name = [str(k.vorname), str(k.name)].filter(Boolean);
  const displayName = name.length
    ? `${str(k.vorname)} ${str(k.name) ? str(k.name)[0] + '.' : ''}`.trim()
    : `K-${klientNr || zemis}`;
  const sw = str(k.fallfuehrung);
  if (!sw) {
    alerts.push({
      code: 'missing_case_manager',
      severity: 'medium',
      personId: klientNr || zemis,
      msg: { key: 'dq.missing_case_manager' },
      sources: [srcRef(k, ['klientNr', 'zemis', 'fallfuehrung'])],
    });
  }
  const zEnde = day(k.zEnde);
  const pay = paymentPeriod(status, entry, ctx);
  const deadline = pay && zEnde !== undefined ? Math.min(pay.end, zEnde) : pay?.end ?? zEnde;
  if (pay && zEnde !== undefined && Math.abs(pay.end - zEnde) > ctx.rules.dq.date_tolerance_days) {
    alerts.push({
      code: 'period_mismatch',
      severity: 'medium',
      personId: klientNr || zemis,
      msg: { key: 'dq.period_mismatch', p: { ze: fmt(zEnde), status, years: pay.years, entry: fmt(entry), end: fmt(pay.end), deadline: fmt(deadline) } },
      sources: [srcRef(k, ['klientNr', 'zemis', 'status', 'zEnde'])],
    });
  }
  return {
    id: klientNr || zemis,
    zemis,
    klientNr,
    dossierNr: str(k.dossierNr),
    displayName,
    socialWorker: sw || '—',
    status,
    statusKlient,
    birth: day(k.geburtsdatum),
    entry,
    entryYear: entry !== undefined ? new Date(entry * 86400000).getUTCFullYear() : undefined,
    zBeginn: day(k.zBeginn),
    zEnde,
    payYears: pay?.years,
    payEnd: pay?.end,
    pay2027: pay?.rule2027,
    deadline,
    current: true,
    goals: {},
    klientRow: k,
  };
}

/**
 * Federal payment period for a status (ORGANISERS Q9): years from entry, from rules.payment_period.
 * From the 2027 switch date, arrivals get new_years_from_entry (ORGANISERS Q7, interpretation B).
 * Status variants "+5"/"+7" are past the period and have none.
 */
export function paymentPeriod(status: string, entry: Day | undefined, ctx: Ctx): { years: number; end: Day; rule2027: boolean } | undefined {
  const base = ctx.rules.payment_period?.years_by_status?.[status];
  if (base === undefined || entry === undefined) return undefined;
  const w = ctx.rules.whatif_2027;
  const sw = parseDate(w.switch_date);
  const rule2027 = w.interpretation === 'B' && sw !== undefined && entry >= sw && w.new_years_from_entry < base;
  const years = rule2027 ? w.new_years_from_entry : base;
  return { years, end: addYears(entry, years), rule2027 };
}

/** Trace line explaining where the deadline for goals 2/3 comes from. */
export function deadlineMsg(p: Person): Msg {
  if (p.deadline === undefined) return { key: 'dl.none' };
  if (p.payEnd !== undefined && p.payEnd === p.deadline)
    return { key: p.pay2027 ? 'dl.period2027' : 'dl.period', p: { deadline: fmt(p.deadline), status: p.status, years: p.payYears ?? '', entry: fmt(p.entry) } };
  if (p.payEnd !== undefined) return { key: 'dl.ze_before', p: { deadline: fmt(p.deadline), pay: fmt(p.payEnd), status: p.status, years: p.payYears ?? '' } };
  return { key: 'dl.ze', p: { deadline: fmt(p.deadline) } };
}

export interface ScopeResult {
  inScope: boolean;
  reason?: Msg;
}

/** Scope for goals 1 and 2 (§2). ageRef = date for the 16+ rule. */
export function personScope(p: Person, ctx: Ctx, ageRef: Day | undefined): ScopeResult {
  const r = ctx.rules.scope;
  const s = p.status;
  if (!s) return { inScope: false, reason: { key: 'na.no_status' } };
  const known = TEMPLATE_VALUES['asylverfahrensstand.Verfahrensstand'];
  if (known && !known.includes(s)) return { inScope: false, reason: { key: 'na.unknown_status', p: { status: s } } };
  if (r.excluded_statuses.includes(s) || /\+\d$/.test(s)) {
    if (/\+\d$/.test(s)) return { inScope: false, reason: { key: 'na.past_responsibility', p: { status: s } } };
    return { inScope: false, reason: { key: 'na.status', p: { status: s } } };
  }
  if (!r.statuses.includes(s)) return { inScope: false, reason: { key: 'na.status_not_in_scope', p: { status: s } } };
  if (p.birth === undefined) return { inScope: true }; // no birth date: cannot exclude by age
  const ref = ageRef ?? ctx.st;
  if (addYears(p.birth, r.min_age) > ref)
    return { inScope: false, reason: { key: 'na.under_age', p: { min: r.min_age, age: ageAt(p.birth, ref), ref: fmt(ref) } } };
  return { inScope: true };
}
