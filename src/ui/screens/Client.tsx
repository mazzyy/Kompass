import { useState } from 'react';
import { SA_FIELDS } from '../../ai/extract';
import { ageAt, fmt, monthsBetween } from '../../engine/dates';
import { TABLE_BY_ID } from '../../engine/import/signatures';
import type { GoalId, Person, SourceRef } from '../../engine/model';
import { msg } from '../../i18n/messages';
import { StatusIcon } from '../icons';
import { statusLabel, tr, type UiKey } from '../strings';
import type { App } from '../useApp';
import { EmptyRun, GoalPills, srcLine } from './common';
import { saValue } from './Situation';

/** One client on a full page: the three goals with their rule trace and source rows, facts, call-list entry, Situationsanalyse, household, data quality. */
export function ClientScreen({ app }: { app: App }) {
  const { lang, result: res } = app;
  const [openTrace, setOpenTrace] = useState<Record<number, boolean>>({});
  if (!res) return <EmptyRun app={app} />;
  const p = (app.visible?.persons ?? []).find((x) => x.id === app.selected);
  const back = () => (history.length > 1 ? history.back() : app.setScreen('clients'));
  if (!p)
    return (
      <div className="empty">
        <span>{tr(lang, 'cp.notFound')}</span>
        <button type="button" className="btn" onClick={() => app.setScreen('clients')}>
          {tr(lang, 'nav.clients')}
        </button>
      </div>
    );

  const st = res.stichtag;
  const call = (res.callLists[p.socialWorker] ?? []).find((c) => c.personId === p.id);
  const callRank = call ? (res.callLists[p.socialWorker] ?? []).indexOf(call) + 1 : undefined;
  const alerts = res.alerts.filter((a) => a.personId === p.id);
  const household = res.persons.filter((x) => x.dossierNr && x.dossierNr === p.dossierNr && x.id !== p.id);
  const conf = app.sa.confirmed[p.zemis];
  let ext: Record<string, { value: unknown; status: string; evidence: string }> | undefined;
  for (const r of Object.values(app.sa.extr)) {
    const hit = r.persons.find((x) => x.zemis === p.zemis);
    if (hit) ext = hit.fields as typeof ext;
  }

  const fact = (label: UiKey, value: string) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <span className="kpi-label">{tr(lang, label)}</span>
      <span style={{ fontWeight: 600 }}>{value || '–'}</span>
    </div>
  );

  return (
    <>
      <div className="page-head">
        <div>
          <button type="button" className="btn link" onClick={back}>
            {tr(lang, 'cp.back')}
          </button>
          <h1 style={{ marginTop: 6 }}>{p.displayName}</h1>
          <p className="sub mono" style={{ fontSize: 13 }}>
            {p.klientNr} · Zemis {p.zemis} · {p.dossierNr} · {p.socialWorker}
          </p>
        </div>
        <GoalPills app={app} p={p} />
      </div>

      <section className="panel" aria-label={tr(lang, 'cl.detail.facts')}>
        <div className="kpis">
          <div className="kpi">{fact('cp.status', p.status)}</div>
          <div className="kpi">{fact('cl.col.entry', fmt(p.entry))}</div>
          <div className="kpi">{fact('cp.age', p.birth !== undefined ? String(ageAt(p.birth, st)) : '')}</div>
          <div className="kpi">{fact('cp.pay', p.payEnd !== undefined ? `${fmt(p.payEnd)} (${p.payYears} J.)` : '')}</div>
          <div className="kpi">{fact('cp.last', p.lastActivity !== undefined ? `${fmt(p.lastActivity)} · ${monthsBetween(p.lastActivity, st)} Mt.` : '')}</div>
        </div>
      </section>

      {call && (
        <div className="note info" role="status" style={{ flexDirection: 'column', gap: 4 }}>
          <strong>{tr(lang, 'cp.onCalls', { n: callRank ?? '', sw: p.socialWorker })}</strong>
          <span>{msg(lang, call.lead)}</span>
          {call.talkingPoints.length > 0 && <span>{call.talkingPoints.map((t) => msg(lang, t)).join(' · ')}</span>}
        </div>
      )}

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 460px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {([1, 2, 3] as GoalId[]).map((g) => {
            const r = p.goals[g];
            const d = r?.deadline;
            const days = d !== undefined ? d - st : undefined;
            const srcs = new Map<string, SourceRef>();
            for (const t of r?.trace ?? []) for (const s of t.sources) srcs.set(`${s.table}:${s.row}`, s);
            return (
              <section key={g} className="panel" aria-label={tr(lang, `goal.${g}` as UiKey)}>
                <div className="panel-head">
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <StatusIcon status={r?.status} size={16} />
                    <span className="panel-title">{tr(lang, `goal.${g}` as UiKey)}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13 }}>
                    <strong>{r ? statusLabel(lang, r.status, r.late) : tr(lang, 'goal.notComputed')}</strong>
                    {r?.deadline !== undefined && (
                      <span className="mono muted" style={{ fontSize: 12 }}>
                        {tr(lang, 'cl.col.deadline')} {fmt(r.deadline)}
                        {days !== undefined && r.status !== 'reached' && r.status !== 'not_applicable' && ` · ${days >= 0 ? tr(lang, 'gp.days.left', { n: days }) : tr(lang, 'gp.days.over', { n: -days })}`}
                      </span>
                    )}
                  </span>
                </div>
                {r && (
                  <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ margin: 0, fontSize: 15 }}>{msg(lang, r.reason)}</p>
                    <button type="button" className="btn link" style={{ alignSelf: 'flex-start', fontSize: 13 }} aria-expanded={!!openTrace[g]} onClick={() => setOpenTrace({ ...openTrace, [g]: !openTrace[g] })}>
                      {openTrace[g] ? tr(lang, 'cp.trace.hide') : tr(lang, 'cp.trace.show', { n: r.trace.length, s: srcs.size })}
                    </button>
                    {openTrace[g] && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {r.trace.map((t, i) => (
                          <div key={i} className="timeline-item">
                            <span className="timeline-dot" aria-hidden="true" />
                            <div style={{ display: 'flex', flexDirection: 'column' }}>
                              <span className="mono muted" style={{ fontSize: 12 }}>{t.rule}</span>
                              <span style={{ fontSize: 13 }}>{msg(lang, t.msg)}</span>
                              {t.sources.map((s) => (
                                <span key={`${s.table}:${s.row}`} className="muted" style={{ fontSize: 12 }}>
                                  {TABLE_BY_ID[s.table].name} · {tr(lang, 'dq.row')} {s.row}: {srcLine(s)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>

        <div style={{ flex: '1 1 300px', display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          <section className="panel" aria-label={tr(lang, 'sa.inClient')}>
            <div className="panel-head">
              <span className="panel-title">{tr(lang, 'cp.sa')}</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {!conf && !ext ? (
                <span className="muted" style={{ fontSize: 13 }}>{tr(lang, 'cp.sa.none')}</span>
              ) : (
                SA_FIELDS.map((f) => {
                  const c = conf?.[f.id];
                  const e = ext?.[f.id];
                  const confirmed = c?.status === 'confirmed';
                  const value = confirmed ? c!.value : e?.status === 'stated' ? e.value : undefined;
                  if (value === undefined || value === null) return null;
                  return (
                    <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13, padding: '3px 0', borderBottom: '1px solid var(--divider-2)' }} title={confirmed ? c!.evidence : e?.evidence}>
                      <span className="muted">{lang === 'de' ? f.de : f.en}</span>
                      <span style={{ fontWeight: 500, textAlign: 'right' }}>
                        {saValue(lang, f.id, value)} {!confirmed && <span className="tag">?</span>}
                      </span>
                    </div>
                  );
                })
              )}
              <span className="tag ai" style={{ whiteSpace: 'normal', alignSelf: 'flex-start', marginTop: 4 }}>{tr(lang, 'sa.aiTag')}</span>
              <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'cp.sa.legend')}</span>
            </div>
          </section>

          {household.length > 0 && (
            <section className="panel" aria-label={tr(lang, 'cp.household')}>
              <div className="panel-head">
                <span className="panel-title">{tr(lang, 'cp.household')}</span>
                <span className="muted mono" style={{ fontSize: 12 }}>{p.dossierNr}</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {household.map((m: Person) => (
                  <button key={m.id} type="button" className="call-row" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }} onClick={() => app.openClient(m.id)}>
                    <span style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 500 }}>
                        {m.displayName}
                        {m.isHead && <span className="tag" style={{ marginLeft: 6 }}>{tr(lang, 'cp.head')}</span>}
                      </span>
                      <span className="mono muted" style={{ fontSize: 12 }}>
                        {m.klientNr} · {m.status}
                        {m.birth !== undefined ? ` · ${ageAt(m.birth, st)} J.` : ''}
                      </span>
                    </span>
                    <GoalPills app={app} p={m} />
                  </button>
                ))}
              </div>
            </section>
          )}

          {alerts.length > 0 && (
            <section className="panel" aria-label={tr(lang, 'nav.quality')}>
              <div className="panel-head">
                <span className="panel-title">{tr(lang, 'nav.quality')}</span>
              </div>
              <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {alerts.map((a, i) => (
                  <div key={i} style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontWeight: 500 }}>{tr(lang, `dq.code.${a.code}` as UiKey)}</span>
                    <span className="muted">{msg(lang, a.msg)}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </>
  );
}
