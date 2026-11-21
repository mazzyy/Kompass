import { useState } from 'react';
import { addYears, fmt } from '../../engine/dates';
import type { GoalId, TotalsRow } from '../../engine/model';
import { msg } from '../../i18n/messages';
import { StatusIcon } from '../icons';
import { pct, statusLabel, tr } from '../strings';
import type { App } from '../useApp';
import { EmptyRun } from './common';

const SEG = [
  { key: 'reached', color: '#1A7F45' },
  { key: 'on_track', color: '#D9A25A' },
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
            <div key={g} style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 24px', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--divider)' }}>
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
                      <tr key={c.personId} className="click" onClick={() => { app.setSelected(p.id); app.setScreen('clients'); }}>
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

      {!sw && res.forecast.length > 0 && (
        <section className="panel" aria-label={tr(lang, 'fc.title')}>
          <div className="panel-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            <span className="panel-title">{tr(lang, 'fc.title')}</span>
            <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'fc.sub', { n: res.claimable.length })}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 150, padding: '16px 20px 0' }}>
            {(() => {
              const max = Math.max(1, ...res.forecast.map((q) => q.goal1 + q.goal2 + q.goal3));
              return res.forecast.map((q) => {
                const tot = q.goal1 + q.goal2 + q.goal3;
                return (
                  <div key={q.label} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 6, height: '100%' }} title={`${tr(lang, 'goal.1')}: ${q.goal1} · ${tr(lang, 'goal.2')}: ${q.goal2} · ${tr(lang, 'goal.3')}: ${q.goal3}`}>
                    <span className="num" style={{ fontSize: 12, fontWeight: 500 }}>{tot}</span>
                    <div style={{ width: '60%', maxWidth: 56, height: `${(tot / max) * 100}px`, minHeight: 2, background: '#1A7F45', borderRadius: '4px 4px 0 0' }} />
                  </div>
                );
              });
            })()}
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
            G1 · G2 · G3. {tr(lang, 'fc.nochf')}
          </div>
        </section>
      )}

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

function TotalsTable({ app, rows, first, onPick }: { app: App; rows: TotalsRow[]; first: string; onPick?: (g: string) => void }) {
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
