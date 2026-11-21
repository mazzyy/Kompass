import { useState } from 'react';
import { addYears, fmt } from '../../engine/dates';
import type { GoalId, TotalsRow } from '../../engine/model';
import { msg } from '../../i18n/messages';
import { StatusIcon } from '../icons';
import { pct, statusLabel, tr, type UiKey } from '../strings';
import type { App } from '../useApp';
import { EmptyRun } from './common';

const SEG = [
  { key: 'reached', color: '#1A7F45' },
  { key: 'on_track', color: '#F2C200' },
  { key: 'at_risk', color: '#D12C1F' },
  { key: 'missed', color: '#8A1C14' },
] as const;

function segCounts(r: TotalsRow) {
  return { reached: r.reached, on_track: r.counts.on_track, at_risk: r.counts.at_risk, missed: r.counts.missed };
}

export function StackBar({ r, lang }: { r: TotalsRow; lang: App['lang'] }) {
  const c = segCounts(r);
  return (
    <div className="sbar" role="img" aria-label={SEG.map((s) => `${statusLabel(lang, s.key)} ${c[s.key]}`).join(', ')}>
      {SEG.map((s) => (c[s.key] > 0 ? <div key={s.key} title={`${statusLabel(lang, s.key)}: ${c[s.key]}`} style={{ flexGrow: c[s.key], background: s.color }} /> : null))}
    </div>
  );
}

export function OverviewScreen({ app }: { app: App }) {
  const { lang, result: res } = app;
  const [whatIf, setWhatIf] = useState(false);
  if (!res) return <EmptyRun app={app} />;
  const wi = whatIf ? res.whatIf : undefined;
  const sw = app.role.kind === 'sw' ? app.role.name : undefined;
  const t1 = res.totals[1];
  const row1: TotalsRow | undefined = t1 ? (sw ? t1.bySocialWorker.find((r) => r.group === sw) : t1.overall) : undefined;
  const persons = app.visible!.persons;
  const goals: GoalId[] = [1, 2, 3];

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr(lang, 'ov.title')}</h1>
          <p className="sub">{sw ? tr(lang, 'ov.sub.sw', { date: fmt(res.stichtag), n: persons.length, sw }) : tr(lang, 'ov.sub', { date: fmt(res.stichtag), n: persons.length })}</p>
        </div>
        {!sw && res.whatIf && (
          <button type="button" className={`btn${whatIf ? ' primary' : ''}`} aria-pressed={whatIf} title={tr(lang, 'wi.tooltip')} onClick={() => setWhatIf(!whatIf)}>
            {tr(lang, 'wi.toggle')}
          </button>
        )}
      </div>

      {wi && (
        <div className="note info" role="status" style={{ flexDirection: 'column' }}>
          <span>{tr(lang, wi.interpretation === 'B' ? 'wi.info.B' : 'wi.info', { i: wi.interpretation, n: wi.affected })}</span>
          <span style={{ fontSize: 12 }}>{tr(lang, 'wi.tooltip')}</span>
        </div>
      )}

      <Today app={app} />

      {res.notes.map((n, i) => (
        <div key={i} className="note">
          {msg(lang, n)}
        </div>
      ))}

      {row1 && (
        <section className="panel" aria-label="KPI">
          <div className="kpis">
            <div className="kpi">
              <span className="kpi-label">{tr(lang, 'ov.kpi.clients')}</span>
              <span className="kpi-value">{persons.length}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{tr(lang, 'ov.kpi.scope')}</span>
              <span className="kpi-value">{row1.counted}</span>
              <span className="kpi-sub">{tr(lang, 'ov.kpi.scope.sub', { na: row1.counts.not_applicable, nd: row1.counts.no_data })}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{tr(lang, 'ov.kpi.reached')}</span>
              <span className="kpi-value" style={{ color: 'var(--reached-text)' }}>
                {pct(row1.rate)}
              </span>
              <span className="kpi-sub">
                {row1.reached} / {row1.counted} · {tr(lang, 'ov.kpi.reached.sub', { late: row1.counts.reached_late })}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{tr(lang, 'ov.kpi.risk')}</span>
              <span className="kpi-value" style={{ color: 'var(--risk)' }}>
                {row1.counts.at_risk}
              </span>
              <span className="kpi-sub">{tr(lang, 'ov.kpi.risk.sub', { n: app.windowMonths })}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{tr(lang, 'ov.kpi.missed')}</span>
              <span className="kpi-value" style={{ color: 'var(--missed)' }}>
                {row1.counts.missed}
              </span>
            </div>
          </div>
        </section>
      )}

      {(() => {
        const ids = new Set(persons.map((p) => p.id));
        const cl = res.claimable.filter((c) => ids.has(c.personId));
        const by = (g: number) => cl.filter((c) => c.goal === g).length;
        const ls = app.rules.payment.lump_sum_chf as Record<string, number | null>;
        const chfSet = [1, 2, 3].every((g) => typeof ls[`goal${g}`] === 'number');
        const chf = chfSet ? cl.reduce((s, c) => s + (ls[`goal${c.goal}`] ?? 0), 0) : undefined;
        return (
          <section className="panel" aria-label={tr(lang, 'ov.claim')}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center', padding: '16px 20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '0 0 auto' }}>
                <span className="kpi-label">{tr(lang, 'ov.claim')}</span>
                <span className="kpi-value" style={{ color: 'var(--reached-text)' }}>{cl.length}</span>
              </div>
              <div style={{ flex: '1 1 320px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13 }}>
                <span style={{ color: 'var(--ink-2)' }}>{tr(lang, 'ov.claim.sub')}</span>
                <span className="num">{tr(lang, 'ov.claim.goals', { g1: by(1), g2: by(2), g3: by(3) })}</span>
                <span className="muted" style={{ fontSize: 12 }}>{chf !== undefined ? tr(lang, 'ov.claim.chf', { chf: chf.toLocaleString('de-CH') }) : tr(lang, 'ov.claim.nochf')}</span>
              </div>
              <button type="button" className="btn" disabled={!cl.length} onClick={() => { app.setDqOpen('reached_not_recorded'); app.setScreen('quality'); }}>
                {tr(lang, 'ov.claim.open')}
              </button>
            </div>
          </section>
        );
      })()}

      <section className="panel" aria-label={tr(lang, 'ov.tva')}>
        <div className="panel-head">
          <span className="panel-title">{tr(lang, 'ov.tva')}</span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12, color: 'var(--ink-2)' }}>
            {(['reached', 'on_track', 'at_risk', 'missed', 'not_applicable'] as const).map((s) => (
              <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <StatusIcon status={s} size={13} />
                {statusLabel(lang, s)}
              </span>
            ))}
          </div>
        </div>
        {goals.map((g) => {
          const t = res.totals[g];
          const r = t ? (sw ? t.bySocialWorker.find((x) => x.group === sw) : t.overall) : undefined;
          return (
            <div
              key={g}
              className={r ? 'goal-row' : undefined}
              onClick={r ? () => app.openGoal(g) : undefined}
              style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--divider)' }}
            >
              <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontWeight: 600, color: r ? 'var(--ink)' : 'var(--muted)' }}>{tr(lang, `goal.${g}` as 'goal.1')}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {tr(lang, `goal.${g}.rule` as 'goal.1.rule')}
                </span>
                {g === 1 && r && r.counts.no_data > 0 && (
                  <span className="muted" style={{ fontSize: 12 }}>
                    {msg(lang, { key: 'note.no_entry', p: { n: r.counts.no_data } })}
                  </span>
                )}
              </div>
              {wi && (g === 2 || g === 3) && (
                <span style={{ flex: '1 1 100%', display: 'flex', gap: 6, flexWrap: 'wrap', fontSize: 12 }}>
                  {(['on_track', 'at_risk', 'missed'] as const)
                    .filter((st) => wi.delta[g][st] !== 0)
                    .map((st) => (
                      <span key={st} className={`tag${st === 'missed' || st === 'at_risk' ? ' bad' : ''}`}>
                        {wi.delta[g][st] > 0 ? '+' : ''}
                        {wi.delta[g][st]} {statusLabel(lang, st)}
                      </span>
                    ))}
                </span>
              )}
              {r ? (
                <>
                  <div style={{ flex: '2 1 300px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <StackBar r={r} lang={lang} />
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--muted)' }}>
                      <span>{tr(lang, 'ov.reachedPct', { pct: pct(r.rate) })}</span>
                      <span>
                        {r.counted} {tr(lang, t!.unit === 'households' ? 'ov.unit.households' : 'ov.unit.persons')}
                      </span>
                    </div>
                  </div>
                  <div style={{ flex: '1 1 260px', display: 'flex', gap: 18 }} className="num">
                    {(
                      [
                        ['ov.col.reached', r.reached, 'var(--reached-text)'],
                        ['ov.col.track', r.counts.on_track, 'var(--track-text)'],
                        ['ov.col.risk', r.counts.at_risk, 'var(--risk)'],
                        ['ov.col.missed', r.counts.missed, 'var(--missed)'],
                      ] as const
                    ).map(([k, v, c]) => (
                      <div key={k} style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 11, color: 'var(--muted)' }}>{tr(lang, k)}</span>
                        <span style={{ fontSize: 16, fontWeight: 600, color: c }}>{v}</span>
                      </div>
                    ))}
                  </div>
                  <button type="button" className="btn small" aria-label={tr(lang, 'gp.open.aria', { goal: tr(lang, `goal.${g}` as 'goal.1') })} onClick={(e) => { e.stopPropagation(); app.openGoal(g); }}>
                    {tr(lang, 'gp.open')}
                  </button>
                </>
              ) : (
                <span className="muted" style={{ flex: '3 1 400px', fontSize: 13 }}>
                  {tr(lang, 'goal.notComputed')}
                </span>
              )}
            </div>
          );
        })}
        <div className="muted" style={{ padding: '10px 20px', fontSize: 12 }}>
          {tr(lang, 'ov.counted.help')}
        </div>
      </section>

      {wi && (
        <section className="panel" aria-label={tr(lang, 'wi.toggle')}>
          <div className="panel-head">
            <span className="panel-title">{tr(lang, 'wi.changed', { n: wi.changes.filter((c) => c.before[2] !== c.after[2] || c.before[3] !== c.after[3]).length })}</span>
          </div>
          <div className="scroll-x">
            <table className="t" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th scope="col">{tr(lang, 'cl.col.client')}</th>
                  <th scope="col">{tr(lang, 'wi.col.end')}</th>
                  <th scope="col">{tr(lang, 'goal.2')}</th>
                  <th scope="col">{tr(lang, 'goal.3')}</th>
                </tr>
              </thead>
              <tbody>
                {wi.changes
                  .filter((c) => c.before[2] !== c.after[2] || c.before[3] !== c.after[3])
                  .map((c) => {
                    const p = res.persons.find((x) => x.id === c.personId)!;
                    return (
                      <tr key={c.personId} className="click" onClick={() => app.openClient(p.id)}>
                        <td>
                          <div style={{ fontWeight: 500 }}>{p.displayName}</div>
                          <div className="mono muted" style={{ fontSize: 12 }}>{p.klientNr} · {p.socialWorker}</div>
                        </td>
                        <td className="mono" style={{ fontSize: 12 }}>{fmt(c.oldEnd)} → {fmt(c.newEnd)}</td>
                        <td>{statusLabel(lang, c.before[2])} → <strong>{statusLabel(lang, c.after[2])}</strong></td>
                        <td>{statusLabel(lang, c.before[3])} → <strong>{statusLabel(lang, c.after[3])}</strong></td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!sw && res.forecast.length > 0 && <Forecast app={app} />}

      {t1 && !sw && (
        <section className="panel" aria-label={tr(lang, 'ov.bySw')}>
          <div className="panel-head">
            <span className="panel-title">{tr(lang, 'ov.bySw')}</span>
            <span className="muted" style={{ fontSize: 12 }}>
              {tr(lang, 'ov.bySw.sub')}
            </span>
          </div>
          <div className="scroll-x">
            <TotalsTable
              app={app}
              rows={t1.bySocialWorker}
              first={tr(lang, 'ov.col.sw')}
              onPick={(name) => {
                app.setCallsSw(name);
                app.setScreen('calls');
              }}
            />
          </div>
        </section>
      )}

      {!sw && <Caseload app={app} />}

      {t1 && (
        <section className="panel" aria-label={tr(lang, 'ov.byYear')}>
          <div className="panel-head">
            <span className="panel-title">{tr(lang, 'ov.byYear')}</span>
            <span className="muted" style={{ fontSize: 12, maxWidth: 560 }}>
              {tr(lang, 'ov.byYear.sub', { date: fmt(addYears(res.stichtag, -app.rules.goal1.years_from_entry)) })}
            </span>
          </div>
          <div style={{ padding: '10px 20px 14px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {(sw ? yearRowsFor(app, sw) : t1.byEntryYear)
              .filter((r) => r.counted > 0)
              .map((r) => (
                <div key={r.group} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 30 }}>
                  <span className="mono" style={{ width: 44, fontSize: 13 }}>
                    {r.group}
                  </span>
                  <div style={{ flex: 1 }}>
                    <StackBar r={r} lang={lang} />
                  </div>
                  <span className="num" style={{ width: 170, textAlign: 'right', fontSize: 12, color: 'var(--ink-2)' }}>
                    {r.reached}/{r.counted} · {pct(r.rate)} · {tr(lang, 'ov.col.risk').toLowerCase()} {r.counts.at_risk}
                  </span>
                </div>
              ))}
          </div>
        </section>
      )}

    </>
  );
}

function yearRowsFor(app: App, sw: string): TotalsRow[] {
  // Per-social-worker entry-year rows computed from the visible person results (same bucket logic as totals).
  const m = new Map<string, TotalsRow>();
  for (const p of app.visible!.persons) {
    if (p.socialWorker !== sw) continue;
    const g = p.goals[1];
    if (!g) continue;
    const k = p.entryYear !== undefined ? String(p.entryYear) : '–';
    if (!m.has(k)) m.set(k, { group: k, counts: { reached_on_time: 0, reached_late: 0, on_track: 0, at_risk: 0, missed: 0, no_data: 0, not_applicable: 0 }, counted: 0, reached: 0, rate: null, total: 0 });
    const r = m.get(k)!;
    const b = g.status === 'reached' ? (g.late ? 'reached_late' : 'reached_on_time') : g.status;
    r.counts[b]++;
  }
  return [...m.values()]
    .map((r) => {
      r.reached = r.counts.reached_on_time + r.counts.reached_late;
      r.counted = r.reached + r.counts.on_track + r.counts.at_risk + r.counts.missed;
      r.rate = r.counted ? r.reached / r.counted : null;
      return r;
    })
    .sort((a, b) => a.group.localeCompare(b.group));
}

export function TotalsTable({ app, rows, first, onPick }: { app: App; rows: TotalsRow[]; first: string; onPick?: (g: string) => void }) {
  const { lang } = app;
  return (
    <table className="t num" style={{ minWidth: 560 }}>
      <thead>
        <tr>
          <th scope="col">{first}</th>
          <th scope="col" className="r">
            {tr(lang, 'ov.col.counted')}
          </th>
          <th scope="col" className="r">
            {tr(lang, 'ov.col.reached')}
          </th>
          <th scope="col" className="r">
            {tr(lang, 'ov.col.track')}
          </th>
          <th scope="col" className="r">
            {tr(lang, 'ov.col.risk')}
          </th>
          <th scope="col" className="r">
            {tr(lang, 'ov.col.missed')}
          </th>
          <th scope="col" style={{ width: 170 }}>
            {tr(lang, 'ov.col.rate')}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.group}>
            <td>
              {onPick ? (
                <button type="button" className="btn link" onClick={() => onPick(r.group)}>
                  {r.group}
                </button>
              ) : (
                r.group
              )}
            </td>
            <td className="r">{r.counted}</td>
            <td className="r">{r.reached}</td>
            <td className="r">{r.counts.on_track}</td>
            <td className="r" style={{ color: 'var(--risk)', fontWeight: 500 }}>
              {r.counts.at_risk}
            </td>
            <td className="r" style={{ color: 'var(--missed)', fontWeight: 500 }}>
              {r.counts.missed}
            </td>
            <td>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--divider)', overflow: 'hidden' }}>
                  <div style={{ width: `${Math.round((r.rate ?? 0) * 100)}%`, height: '100%', background: '#1A7F45' }} />
                </div>
                <span style={{ width: 40, textAlign: 'right' }}>{pct(r.rate)}</span>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Caseload per social worker across all goals (management). */
function Caseload({ app }: { app: App }) {
  const { lang, result: res } = app;
  if (!res) return null;
  const rows = res.socialWorkers.map((name) => {
    const ps = res.persons.filter((p) => p.socialWorker === name);
    const hh = res.households.filter((h) => h.socialWorker === name);
    const red = ps.filter((p) => p.goals[1]?.status === 'at_risk' || p.goals[2]?.status === 'at_risk').length + hh.filter((h) => h.goal3?.status === 'at_risk').length;
    const missed = ps.filter((p) => p.goals[1]?.status === 'missed' || p.goals[2]?.status === 'missed').length + hh.filter((h) => h.goal3?.status === 'missed').length;
    const ids = new Set(ps.map((p) => p.id));
    return { name, clients: ps.length, hh: hh.length, red, missed, calls: res.callLists[name]?.length ?? 0, dq: res.alerts.filter((a) => a.personId && ids.has(a.personId)).length };
  });
  const max = Math.max(1, ...rows.map((r) => r.clients));
  return (
    <section className="panel" aria-label={tr(lang, 'gp.caseload')}>
      <div className="panel-head">
        <span className="panel-title">{tr(lang, 'gp.caseload')}</span>
        <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'gp.caseload.sub')}</span>
      </div>
      <div className="scroll-x">
        <table className="t num" style={{ minWidth: 640 }}>
          <thead>
            <tr>
              <th scope="col">{tr(lang, 'ov.col.sw')}</th>
              <th scope="col" style={{ width: 200 }}>{tr(lang, 'gp.cl.clients')}</th>
              <th scope="col" className="r">{tr(lang, 'gp.cl.households')}</th>
              <th scope="col" className="r">{tr(lang, 'gp.cl.red')}</th>
              <th scope="col" className="r">{tr(lang, 'gp.cl.missed')}</th>
              <th scope="col" className="r">{tr(lang, 'gp.cl.calls')}</th>
              <th scope="col" className="r">{tr(lang, 'gp.cl.dq')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.name}>
                <td>
                  <button type="button" className="btn link" onClick={() => { app.setCallsSw(r.name); app.setScreen('calls'); }}>
                    {r.name}
                  </button>
                </td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ flex: 1, height: 6, borderRadius: 999, background: 'var(--divider)', overflow: 'hidden' }}>
                      <div style={{ width: `${(r.clients / max) * 100}%`, height: '100%', background: 'var(--ink-2)' }} />
                    </div>
                    <span style={{ width: 36, textAlign: 'right' }}>{r.clients}</span>
                  </div>
                </td>
                <td className="r">{r.hh}</td>
                <td className="r" style={{ color: 'var(--risk)', fontWeight: 500 }}>{r.red}</td>
                <td className="r" style={{ color: 'var(--missed)', fontWeight: 500 }}>{r.missed}</td>
                <td className="r">{r.calls}</td>
                <td className="r">{r.dq}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const fmtChf = (n: number) => n.toLocaleString('de-CH');

/** Forecast per quarter; in CHF once the lump sums per goal are entered (they come from ASD's contract, not public). */
function Forecast({ app }: { app: App }) {
  const { lang, result: res } = app;
  const ls = app.rules.payment.lump_sum_chf as Record<string, number | null>;
  const val = (g: number) => (typeof ls[`goal${g}`] === 'number' ? (ls[`goal${g}`] as number) : null);
  const set = [1, 2, 3].every((g) => val(g) !== null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<number, string>>({ 1: String(val(1) ?? ''), 2: String(val(2) ?? ''), 3: String(val(3) ?? '') });
  if (!res) return null;
  const chfOf = (q: { goal1: number; goal2: number; goal3: number }) => q.goal1 * (val(1) ?? 0) + q.goal2 * (val(2) ?? 0) + q.goal3 * (val(3) ?? 0);
  const total = res.forecast.reduce((s, q) => s + chfOf(q), 0);
  const now = res.claimable.reduce((s, c) => s + (val(c.goal) ?? 0), 0);
  const metric = (q: { goal1: number; goal2: number; goal3: number }) => (set ? chfOf(q) : q.goal1 + q.goal2 + q.goal3);
  const max = Math.max(1, ...res.forecast.map(metric));
  const parse = (x: string) => {
    const n = Number(String(x).replace(/['’\s]/g, '').replace(',', '.'));
    return x.trim() === '' || !Number.isFinite(n) || n < 0 ? null : Math.round(n);
  };
  return (
    <section className="panel" aria-label={tr(lang, 'fc.title')}>
      <div className="panel-head">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: '1 1 400px' }}>
          <span className="panel-title">{tr(lang, 'fc.title')}</span>
          <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'fc.sub', { n: res.claimable.length })}</span>
        </div>
        <button type="button" className="btn small" aria-expanded={open} onClick={() => setOpen(!open)}>
          {tr(lang, set ? 'fc.lump.change' : 'fc.lump.edit')}
        </button>
      </div>
      {open && (
        <form
          style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', padding: '12px 20px', borderBottom: '1px solid var(--divider)', background: 'var(--bg-app)' }}
          onSubmit={(e) => {
            e.preventDefault();
            app.setLumpSums({ 1: parse(draft[1]), 2: parse(draft[2]), 3: parse(draft[3]) });
            setOpen(false);
          }}
        >
          <div style={{ flex: '1 1 100%', display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{tr(lang, 'fc.lump.title')}</span>
            <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'fc.lump.sub')}</span>
          </div>
          {[1, 2, 3].map((g) => (
            <label key={g} style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12, flex: '1 1 160px' }}>
              {tr(lang, `goal.${g}` as 'goal.1')}
              <input className="input mono" inputMode="numeric" placeholder="CHF" value={draft[g]} onChange={(e) => setDraft({ ...draft, [g]: e.target.value })} />
            </label>
          ))}
          <button type="submit" className="btn primary">
            {tr(lang, 'fc.lump.save')}
          </button>
        </form>
      )}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 150, padding: '16px 20px 0' }}>
        {res.forecast.map((q) => {
          const m = metric(q);
          return (
            <div key={q.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }} title={`${tr(lang, 'goal.1')}: ${q.goal1} · ${tr(lang, 'goal.2')}: ${q.goal2} · ${tr(lang, 'goal.3')}: ${q.goal3}`}>
              <span className="num" style={{ fontSize: 12, fontWeight: 500 }}>{set ? `CHF ${fmtChf(m)}` : m}</span>
              <div style={{ width: '60%', maxWidth: 56, height: `${(m / max) * 100}px`, minHeight: 2, background: '#1A7F45', borderRadius: '4px 4px 0 0' }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 16, padding: '6px 20px 10px', borderTop: '1px solid var(--divider)' }}>
        {res.forecast.map((q) => (
          <span key={q.label} className="muted num" style={{ flex: 1, textAlign: 'center', fontSize: 12 }}>
            {q.label}
            <br />
            {q.goal1} · {q.goal2} · {q.goal3}
          </span>
        ))}
      </div>
      <div className="muted" style={{ padding: '8px 20px 12px', fontSize: 12, borderTop: '1px solid var(--divider)' }}>
        G1 · G2 · G3. {set ? tr(lang, 'fc.chf', { total: fmtChf(total), n: res.forecast.length, now: fmtChf(now) }) : tr(lang, 'fc.nochf')}
      </div>
    </section>
  );
}

/** "Important today": four numbers that each open the screen where the work is done. */
function Today({ app }: { app: App }) {
  const { lang, result: res } = app;
  if (!res) return null;
  const sw = app.role.kind === 'sw' ? app.role.name : undefined;
  const sws = sw ? [sw] : res.socialWorkers;
  const top = app.rules.calls.top_n;
  const calls = sws.reduce((s, n) => s + Math.min(top, res.callLists[n]?.length ?? 0), 0);
  const flagged = sws.reduce((s, n) => s + (res.callLists[n]?.length ?? 0), 0);
  const persons = app.visible!.persons;
  const ids = new Set(persons.map((p) => p.id));
  const soon = persons.filter((p) =>
    ([1, 2, 3] as const).some((g) => {
      const r = p.goals[g];
      if (!r || r.status !== 'at_risk' || (g === 3 && !p.isHead)) return false;
      const d = r.latestAction ?? r.deadline;
      return d !== undefined && d - res.stichtag <= 30;
    }),
  ).length;
  const claim = res.claimable.filter((c) => ids.has(c.personId)).length;
  const dq = res.alerts.filter((a) => a.severity === 'high' && a.code !== 'reached_not_recorded' && (!a.personId || ids.has(a.personId))).length;
  const tile = (label: UiKey, value: number, sub: string, color: string, go: () => void) => (
    <button type="button" className="kpi today" onClick={go}>
      <span className="kpi-label">{tr(lang, label)}</span>
      <span className="kpi-value" style={{ color }}>{value}</span>
      <span className="kpi-sub">{sub} →</span>
    </button>
  );
  return (
    <section className="panel" aria-label={tr(lang, 'hd.title')}>
      <div className="panel-head">
        <span className="panel-title">{tr(lang, 'hd.title')}</span>
      </div>
      <div className="kpis">
        {tile('hd.calls', calls, tr(lang, 'hd.calls.sub', { n: top, all: flagged }), 'var(--ink)', () => app.setScreen('calls'))}
        {tile('hd.soon', soon, tr(lang, 'hd.soon.sub'), 'var(--risk)', () => app.setScreen('calls'))}
        {tile('hd.claim', claim, tr(lang, 'hd.claim.sub'), 'var(--reached-text)', () => { app.setDqOpen('reached_not_recorded'); app.setScreen('quality'); })}
        {tile('hd.dq', dq, tr(lang, 'hd.dq.sub'), dq ? 'var(--risk)' : 'var(--ink)', () => app.setScreen('quality'))}
      </div>
    </section>
  );
}
