import { useMemo, useState } from 'react';
import { SA_FIELDS, type SaFieldId } from '../../ai/extract';
import { addMonths, fmt, monthsBetween } from '../../engine/dates';
import type { GoalId, GoalResult, Person, Status, TotalsRow } from '../../engine/model';
import { msg } from '../../i18n/messages';
import { StatusIcon } from '../icons';
import { hasUi, pct, statusLabel, tr, type UiKey } from '../strings';
import type { App } from '../useApp';
import { BARRIER } from './Calls';
import { EmptyRun } from './common';
import { StackBar, TotalsTable } from './Overview';

/** One counted unit: a person (goals 1, 2) or a household, represented by its head (goal 3). */
interface Item {
  p: Person;
  members: Person[];
  r: GoalResult;
  dossier?: string;
  sw: string;
}

interface Barrier {
  id: SaFieldId;
  confirmed: boolean;
}

const LAGGING: Status[] = ['at_risk', 'missed'];
const FIXABLE = new Set(['g1.missed.proof', 'g1.at_risk.proof']);

const hasKey = (_lang: App['lang'], k: string): k is UiKey => hasUi(k);

export function GoalScreen({ app }: { app: App }) {
  const { lang, result: res } = app;
  const g = app.goalId;
  const [reason, setReason] = useState<string | undefined>();
  const sw = app.role.kind === 'sw' ? app.role.name : undefined;

  const items: Item[] = useMemo(() => {
    if (!res) return [];
    const byId = new Map(res.persons.map((p) => [p.id, p]));
    if (g === 3) {
      return res.households
        .filter((h) => h.goal3 && (!sw || h.socialWorker === sw))
        .map((h) => {
          const members = h.members.map((m) => byId.get(m)).filter((x): x is Person => !!x);
          const head = (h.head && byId.get(h.head)) || members[0];
          return { p: head, members, r: h.goal3!, dossier: h.dossierNr, sw: h.socialWorker };
        })
        .filter((x) => x.p);
    }
    return (app.visible?.persons ?? []).filter((p) => p.goals[g]).map((p) => ({ p, members: [p], r: p.goals[g]!, sw: p.socialWorker }));
  }, [res, g, sw, app.visible]);

  // Situationsanalyse barriers per Zemis-Nr.: confirmed by a social worker, or a model proposal not yet reviewed.
  const barriersOf = useMemo(() => {
    const ext = new Map<string, Record<string, { value: unknown; status: string }>>();
    for (const r of Object.values(app.sa.extr)) for (const x of r.persons) ext.set(x.zemis, x.fields as Record<string, { value: unknown; status: string }>);
    return (zemis: string): Barrier[] | undefined => {
      const c = app.sa.confirmed[zemis];
      const e = ext.get(zemis);
      if (!c && !e) return undefined; // report not read on this computer
      const out: Barrier[] = [];
      for (const f of SA_FIELDS) {
        const test = BARRIER[f.id];
        if (!test) continue;
        const cf = c?.[f.id];
        if (cf?.status === 'confirmed') {
          if (test(cf.value)) out.push({ id: f.id, confirmed: true });
          continue;
        }
        if (cf) continue; // rejected / edited away
        const ef = e?.[f.id];
        if (ef && ef.status === 'stated' && test(ef.value)) out.push({ id: f.id, confirmed: false });
      }
      return out;
    };
  }, [app.sa.extr, app.sa.confirmed]);

  if (!res) return <EmptyRun app={app} />;
  const totals = res.totals[g];
  const goalName = tr(lang, `goal.${g}` as UiKey);
  const st = res.stichtag;
  const unitHH = g === 3;

  const counted = items.filter((x) => x.r.status !== 'not_applicable' && x.r.status !== 'no_data');
  const reached = counted.filter((x) => x.r.status === 'reached');
  const lagging = counted.filter((x) => LAGGING.includes(x.r.status));
  const count = (s: Status) => items.filter((x) => x.r.status === s).length;

  // Reasons for lagging behind, from the rule that set the light.
  const reasonGroups = groupBy(lagging, (x) => x.r.reason.key)
    .map(([key, xs]) => ({ key, xs, label: hasKey(lang, `lag.${key}`) ? tr(lang, `lag.${key}` as UiKey) : key, missed: xs.filter((x) => x.r.status === 'missed').length }))
    .sort((a, b) => b.xs.length - a.xs.length);
  const maxReason = Math.max(1, ...reasonGroups.map((r) => r.xs.length));

  // Barriers among people lagging behind.
  const people = lagging.flatMap((x) => x.members.filter((m) => g !== 3 || m.goals[3]));
  const withReport = people.filter((m) => barriersOf(m.zemis) !== undefined);
  const barrierCounts = SA_FIELDS.filter((f) => BARRIER[f.id]).map((f) => {
    let c = 0;
    let pr = 0;
    for (const m of withReport) for (const b of barriersOf(m.zemis)!) if (b.id === f.id) (b.confirmed ? c++ : pr++);
    return { f, c, pr };
  });

  // Lagging per social worker.
  const swRows = groupBy(counted, (x) => x.sw)
    .map(([name, xs]) => {
      const lag = xs.filter((x) => LAGGING.includes(x.r.status));
      const top = groupBy(lag, (x) => x.r.reason.key).sort((a, b) => b[1].length - a[1].length)[0];
      return { name, n: xs.length, lag: lag.length, share: xs.length ? lag.length / xs.length : null, top: top ? (hasKey(lang, `lag.${top[0]}`) ? tr(lang, `lag.${top[0]}` as UiKey) : top[0]) : '' };
    })
    .sort((a, b) => (b.share ?? 0) - (a.share ?? 0));

  // List of people lagging behind (filtered by reason): at risk soonest first, then missed most recent first.
  const list = lagging
    .filter((x) => !reason || x.r.reason.key === reason)
    .sort((a, b) => {
      if (a.r.status !== b.r.status) return a.r.status === 'at_risk' ? -1 : 1;
      const da = a.r.latestAction ?? a.r.deadline ?? 0;
      const db = b.r.latestAction ?? b.r.deadline ?? 0;
      return a.r.status === 'at_risk' ? da - db : db - da;
    });

  // Deadlines of open items over the next 12 months.
  const months = Array.from({ length: 12 }, (_, i) => {
    const from = addMonths(st, i);
    const to = addMonths(st, i + 1);
    const open = counted.filter((x) => (x.r.status === 'on_track' || x.r.status === 'at_risk') && x.r.deadline !== undefined && x.r.deadline >= from && x.r.deadline < to);
    const d = new Date(from * 86400000);
    return { label: `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCFullYear()).slice(2)}`, risk: open.filter((x) => x.r.status === 'at_risk').length, track: open.filter((x) => x.r.status === 'on_track').length };
  });
  const maxMonth = Math.max(1, ...months.map((m) => m.risk + m.track));

  // Not counted: reasons.
  const naGroups = groupBy(
    items.filter((x) => x.r.status === 'not_applicable' || x.r.status === 'no_data'),
    (x) => `${x.r.reason.key}|${x.r.reason.key === 'na.under_age' || x.r.reason.key === 'g3.na.status' ? '' : String(x.r.reason.p?.status ?? '')}`,
  )
    .map(([k, xs]) => {
      const r = xs[0].r.reason;
      const label = r.key === 'na.under_age' ? tr(lang, 'gp.na.under_age', { min: app.rules.scope.min_age }) : r.key === 'g3.na.status' ? tr(lang, 'gp.na.g3') : msg(lang, r);
      return { k, label, n: xs.length, noData: xs[0].r.status === 'no_data' };
    })
    .sort((a, b) => b.n - a.n);

  const daysText = (r: GoalResult) => {
    const d = r.latestAction ?? r.deadline;
    if (d === undefined) return '';
    const n = d - st;
    return n >= 0 ? tr(lang, 'gp.days.left', { n }) : tr(lang, 'gp.days.over', { n: -n });
  };

  const openClient = (p: Person) => {
    app.setSelected(p.id);
    app.setScreen('clients');
  };

  const kpi = (label: UiKey, value: string | number, color?: string, sub?: string) => (
    <div className="kpi">
      <span className="kpi-label">{tr(lang, label)}</span>
      <span className="kpi-value" style={color ? { color } : undefined}>
        {value}
      </span>
      {sub && <span className="kpi-sub">{sub}</span>}
    </div>
  );

  const swTotals: TotalsRow[] | undefined = totals && !sw ? totals.bySocialWorker : undefined;
  const yearRows: TotalsRow[] | undefined = totals && !sw && g !== 3 ? totals.byEntryYear.filter((r) => r.counted > 0) : undefined;

  return (
    <>
      <div className="page-head">
        <div>
          <button type="button" className="btn link" onClick={() => app.setScreen('overview')}>
            {tr(lang, 'gp.back')}
          </button>
          <h1 style={{ marginTop: 6 }}>{goalName}</h1>
          <p className="sub">
            {tr(lang, `goal.${g}.rule` as UiKey)} {sw ? tr(lang, 'gp.scope.sw', { sw }) : ''}
          </p>
        </div>
        <div role="tablist" aria-label="Ziel" style={{ display: 'flex', gap: 6 }}>
          {([1, 2, 3] as GoalId[]).map((x) => (
            <button key={x} type="button" role="tab" aria-selected={x === g} className={`btn${x === g ? ' primary' : ''}`} disabled={!res.totals[x]} onClick={() => { app.setGoalId(x); setReason(undefined); }}>
              {tr(lang, `goal.${x}` as UiKey).split('·')[0].trim()}
            </button>
          ))}
        </div>
      </div>

      {!totals ? (
        <div className="note">{tr(lang, 'goal.notComputed')}</div>
      ) : (
        <>
          <section className="panel" aria-label="KPI">
            <div className="kpis">
              {kpi('gp.kpi.counted', counted.length, undefined, tr(lang, unitHH ? 'ov.unit.households' : 'ov.unit.persons'))}
              {kpi('ov.col.reached', pct(counted.length ? reached.length / counted.length : null), 'var(--reached-text)', `${reached.length} / ${counted.length}`)}
              {kpi('ov.col.track', count('on_track'), 'var(--track-text)')}
              {kpi('ov.col.risk', count('at_risk'), 'var(--risk)')}
              {kpi('ov.col.missed', count('missed'), 'var(--missed)')}
              {kpi('gp.kpi.na', count('not_applicable'), 'var(--muted)', count('no_data') ? `${tr(lang, 'gp.kpi.nodata')}: ${count('no_data')}` : undefined)}
            </div>
          </section>

          <section className="panel" aria-label={tr(lang, 'gp.lag.title')}>
            <div className="panel-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span className="panel-title">{tr(lang, 'gp.lag.title')}</span>
              <span className="muted" style={{ fontSize: 12 }}>
                {lagging.length ? `${tr(lang, 'gp.lag.count', { n: lagging.length, of: counted.length, pct: pct(counted.length ? lagging.length / counted.length : null) })} · ${tr(lang, 'gp.lag.sub')}` : tr(lang, 'gp.lag.none')}
              </span>
            </div>
            {lagging.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 0 }}>
                <div style={{ flex: '1 1 380px', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6, borderRight: '1px solid var(--divider)' }}>
                  <button type="button" className={`btn small${!reason ? ' primary' : ''}`} style={{ alignSelf: 'flex-start' }} onClick={() => setReason(undefined)}>
                    {tr(lang, 'gp.lag.all')} ({lagging.length})
                  </button>
                  {reasonGroups.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      aria-pressed={reason === r.key}
                      onClick={() => setReason(reason === r.key ? undefined : r.key)}
                      style={{ all: 'unset', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 3, padding: '6px 8px', borderRadius: 6, background: reason === r.key ? 'var(--accent-tint)' : undefined }}
                    >
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13 }}>
                        <span>
                          {r.label}
                          {FIXABLE.has(r.key) && (
                            <span className="tag" style={{ marginLeft: 6 }}>
                              {tr(lang, 'gp.lag.fixable')}
                            </span>
                          )}
                        </span>
                        <span className="num" style={{ fontWeight: 600 }}>
                          {r.xs.length}
                        </span>
                      </span>
                      <span style={{ display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--divider)' }}>
                        <span style={{ width: `${((r.xs.length - r.missed) / maxReason) * 100}%`, background: 'var(--risk)' }} />
                        <span style={{ width: `${(r.missed / maxReason) * 100}%`, background: 'var(--missed)' }} />
                      </span>
                    </button>
                  ))}
                </div>
                <div style={{ flex: '1 1 320px', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{tr(lang, 'gp.barriers')}</span>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {withReport.length ? tr(lang, 'gp.barriers.sub', { n: withReport.length, of: people.length }) : tr(lang, 'gp.barriers.none')}
                  </span>
                  {withReport.length > 0 &&
                    barrierCounts.map(({ f, c, pr }) => (
                      <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '4px 0', borderBottom: '1px solid var(--divider-2)' }}>
                        <span>{tr(lang, `bar.${f.id}` as UiKey)}</span>
                        <span className="num" style={{ display: 'flex', gap: 6 }}>
                          {c > 0 && <span className="tag ai">{tr(lang, 'gp.barriers.confirmed', { n: c })}</span>}
                          {pr > 0 && <span className="tag">{tr(lang, 'gp.barriers.proposed', { n: pr })}</span>}
                          {c === 0 && pr === 0 && <span className="muted">0</span>}
                        </span>
                      </div>
                    ))}
                  <span className="tag ai" style={{ whiteSpace: 'normal', alignSelf: 'flex-start', marginTop: 4 }}>
                    {tr(lang, 'sa.aiTag')}
                  </span>
                </div>
              </div>
            )}
          </section>

          {!sw && swRows.length > 0 && lagging.length > 0 && (
            <section className="panel" aria-label={tr(lang, 'gp.bySw')}>
              <div className="panel-head">
                <span className="panel-title">{tr(lang, 'gp.bySw')}</span>
              </div>
              <div className="scroll-x">
                <table className="t num" style={{ minWidth: 560 }}>
                  <thead>
                    <tr>
                      <th scope="col">{tr(lang, 'ov.col.sw')}</th>
                      <th scope="col" className="r">{tr(lang, 'ov.col.counted')}</th>
                      <th scope="col" className="r">{tr(lang, 'gp.col.lagging')}</th>
                      <th scope="col" style={{ width: 170 }}>{tr(lang, 'gp.col.share')}</th>
                      <th scope="col">{tr(lang, 'gp.col.topReason')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {swRows.map((r) => (
                      <tr key={r.name}>
                        <td>
                          <button type="button" className="btn link" onClick={() => { app.setCallsSw(r.name); app.setScreen('calls'); }}>
                            {r.name}
                          </button>
                        </td>
                        <td className="r">{r.n}</td>
                        <td className="r" style={{ color: 'var(--risk)', fontWeight: 500 }}>{r.lag}</td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--divider)', overflow: 'hidden' }}>
                              <div style={{ width: `${Math.round((r.share ?? 0) * 100)}%`, height: '100%', background: 'var(--risk)' }} />
                            </div>
                            <span style={{ width: 40, textAlign: 'right' }}>{pct(r.share)}</span>
                          </div>
                        </td>
                        <td style={{ color: 'var(--ink-2)' }}>{r.top}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {lagging.length > 0 && (
            <section className="panel" aria-label={tr(lang, unitHH ? 'gp.list.hh' : 'gp.list', { n: list.length })}>
              <div className="panel-head">
                <span className="panel-title">
                  {tr(lang, unitHH ? 'gp.list.hh' : 'gp.list', { n: list.length })}
                  {reason && ` · ${reasonGroups.find((r) => r.key === reason)?.label ?? ''}`}
                </span>
              </div>
              <div className="scroll-x">
                <table className="t" style={{ minWidth: 900 }}>
                  <thead>
                    <tr>
                      <th scope="col">{tr(lang, 'gp.col.client')}</th>
                      <th scope="col">{tr(lang, 'gp.col.status')}</th>
                      <th scope="col">{tr(lang, 'gp.col.deadline')}</th>
                      <th scope="col">{tr(lang, 'gp.col.why')}</th>
                      <th scope="col">{tr(lang, 'gp.col.last')}</th>
                      <th scope="col">{tr(lang, 'gp.col.barriers')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((x) => {
                      const bs = x.members.flatMap((m) => barriersOf(m.zemis) ?? []);
                      const read = x.members.some((m) => barriersOf(m.zemis) !== undefined);
                      const ids = [...new Map(bs.map((b) => [b.id, b])).values()];
                      return (
                        <tr key={x.dossier ?? x.p.id} className="click" onClick={() => openClient(x.p)}>
                          <td>
                            <div style={{ fontWeight: 500 }}>{x.p.displayName}</div>
                            <div className="mono muted" style={{ fontSize: 12 }}>
                              {x.dossier ? tr(lang, 'gp.hh', { d: x.dossier }) : x.p.klientNr} · {x.sw}
                            </div>
                          </td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <StatusIcon status={x.r.status} size={13} />
                              {statusLabel(lang, x.r.status)}
                            </span>
                          </td>
                          <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            {fmt(x.r.deadline)}
                            <div className="muted">{daysText(x.r)}</div>
                          </td>
                          <td style={{ color: 'var(--ink-2)', maxWidth: 360 }}>{msg(lang, x.r.reason)}</td>
                          <td className="mono" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            {x.p.lastActivity !== undefined ? fmt(x.p.lastActivity) : '–'}
                            {x.p.lastActivity !== undefined && <div className="muted">{monthsBetween(x.p.lastActivity, st)} Mt.</div>}
                          </td>
                          <td style={{ fontSize: 12 }}>
                            {!read ? (
                              <span className="muted">–</span>
                            ) : ids.length === 0 ? (
                              <span className="muted">{lang === 'de' ? 'keine genannt' : 'none stated'}</span>
                            ) : (
                              <span style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                {ids.map((b) => {
                                  const f = { id: b.id };
                                  return (
                                    <span key={b.id} className={`tag${b.confirmed ? ' ai' : ''}`} title={b.confirmed ? tr(lang, 'sa.aiTag') : tr(lang, 'calls.saProposal')}>
                                      {tr(lang, `bar.${f.id}` as UiKey)}
                                      {!b.confirmed && ' ?'}
                                    </span>
                                  );
                                })}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="panel" aria-label={tr(lang, 'gp.deadlines')}>
            <div className="panel-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span className="panel-title">{tr(lang, 'gp.deadlines')}</span>
              <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'gp.deadlines.sub')}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, padding: '16px 20px 0' }}>
              {months.map((m) => (
                <div key={m.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 4 }} title={`${statusLabel(lang, 'at_risk')}: ${m.risk} · ${statusLabel(lang, 'on_track')}: ${m.track}`}>
                  <span className="num" style={{ fontSize: 11 }}>{m.risk + m.track || ''}</span>
                  <div style={{ width: '70%', maxWidth: 40, display: 'flex', flexDirection: 'column-reverse' }}>
                    <div style={{ height: (m.track / maxMonth) * 100, background: 'var(--track-bar)', borderRadius: m.risk ? 0 : '3px 3px 0 0' }} />
                    <div style={{ height: (m.risk / maxMonth) * 100, background: 'var(--risk)', borderRadius: '3px 3px 0 0' }} />
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, padding: '6px 20px 12px', borderTop: '1px solid var(--divider)' }}>
              {months.map((m) => (
                <span key={m.label} className="muted mono" style={{ flex: 1, textAlign: 'center', fontSize: 11 }}>
                  {m.label}
                </span>
              ))}
            </div>
          </section>

          {swTotals && (
            <section className="panel" aria-label={tr(lang, 'ov.bySw')}>
              <div className="panel-head">
                <span className="panel-title">{tr(lang, 'ov.bySw').replace(/Ziel 1|Goal 1/, goalName.split('·')[0].trim())}</span>
              </div>
              <div className="scroll-x">
                <TotalsTable app={app} rows={swTotals} first={tr(lang, 'ov.col.sw')} onPick={(name) => { app.setCallsSw(name); app.setScreen('calls'); }} />
              </div>
            </section>
          )}

          {yearRows && yearRows.length > 0 && (
            <section className="panel" aria-label={tr(lang, 'gp.year')}>
              <div className="panel-head">
                <span className="panel-title">{tr(lang, 'gp.year')}</span>
              </div>
              <div style={{ padding: '10px 20px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {yearRows.map((r) => (
                  <div key={r.group} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 30 }}>
                    <span className="mono" style={{ width: 44, fontSize: 13 }}>{r.group}</span>
                    <div style={{ flex: 1 }}>
                      <StackBar r={r} lang={lang} />
                    </div>
                    <span className="num" style={{ width: 200, textAlign: 'right', fontSize: 12, color: 'var(--ink-2)' }}>
                      {r.reached}/{r.counted} · {pct(r.rate)} · {tr(lang, 'ov.col.risk').toLowerCase()} {r.counts.at_risk} · {tr(lang, 'ov.col.missed').toLowerCase()} {r.counts.missed}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {naGroups.length > 0 && (
            <section className="panel" aria-label={tr(lang, 'gp.na')}>
              <div className="panel-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
                <span className="panel-title">{tr(lang, 'gp.na')}</span>
                <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'gp.na.sub')}</span>
              </div>
              <div style={{ padding: '8px 20px 14px', display: 'flex', flexDirection: 'column' }}>
                {naGroups.map((r) => (
                  <div key={r.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 13, padding: '5px 0', borderBottom: '1px solid var(--divider-2)' }}>
                    <span>
                      {r.label}
                      {r.noData && <span className="tag warn" style={{ marginLeft: 6 }}>{tr(lang, 'gp.kpi.nodata')}</span>}
                    </span>
                    <span className="num" style={{ fontWeight: 500 }}>{r.n}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}

function groupBy<T>(xs: T[], key: (x: T) => string): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const x of xs) {
    const k = key(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k)!.push(x);
  }
  return [...m.entries()];
}

