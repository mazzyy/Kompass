import { fmt } from '../../engine/dates';
import { TABLE_BY_ID } from '../../engine/import/signatures';
import type { GoalId, Person, SourceRef } from '../../engine/model';
import { msg } from '../../i18n/messages';
import { StatusIcon } from '../icons';
import { SA_FIELDS } from '../../ai/extract';
import { statusLabel, tr } from '../strings';
import { saValue } from './Situation';
import type { App } from '../useApp';

export function EmptyRun({ app }: { app: App }) {
  if (app.restoring)
    return (
      <div className="empty loading" role="status">
        <span>{tr(app.lang, 'empty.restoring')}</span>
      </div>
    );
  return (
    <div className="empty">
      <span>{tr(app.lang, 'empty.noRun')}</span>
      <button type="button" className="btn primary" onClick={() => app.setScreen('run')}>
        {tr(app.lang, 'empty.toRun')}
      </button>
    </div>
  );
}

export function GoalPills({ app, p }: { app: App; p: Person }) {
  return (
    <span style={{ display: 'inline-flex', gap: 6, flex: 'none' }}>
      {([1, 2, 3] as GoalId[]).map((g) => {
        const r = p.goals[g];
        const label = `${tr(app.lang, `goal.${g}` as 'goal.1')}: ${r ? statusLabel(app.lang, r.status, r.late) : tr(app.lang, 'goal.notComputed')}`;
        return r ? <StatusIcon key={g} status={r.status} label={label} /> : <span key={g} title={label} style={{ opacity: 0.35 }}><StatusIcon status={undefined} label={label} /></span>;
      })}
    </span>
  );
}

export function srcLine(s: SourceRef): string {
  return Object.entries(s.fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join(' · ');
}

/** Goals, reasoning trace and source rows for one person. Everything comes from the RunResult. */
export function PersonFacts({ app, p }: { app: App; p: Person }) {
  const { lang } = app;
  const sources = new Map<string, SourceRef>();
  for (const g of Object.values(p.goals)) for (const t of g!.trace) for (const s of t.sources) sources.set(`${s.table}:${s.row}`, s);
  return (
    <>
      <div className="detail-sec">
        <span className="sec-title">{tr(lang, 'calls.goals')}</span>
        {([1, 2, 3] as GoalId[]).map((g) => {
          const r = p.goals[g];
          return (
            <div key={g} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 13, minHeight: 28 }}>
              <span style={{ width: 170, flex: 'none', color: 'var(--muted)' }}>{tr(lang, `goal.${g}` as 'goal.1')}</span>
              <span style={{ paddingTop: 2 }}>
                <StatusIcon status={r?.status} size={14} />
              </span>
              <span style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontWeight: 500 }}>
                  {r ? statusLabel(lang, r.status, r.late) : tr(lang, 'goal.notComputed')}
                  {r?.deadline !== undefined && <span className="muted mono" style={{ fontWeight: 400, fontSize: 12 }}> · {tr(lang, 'cl.col.deadline')} {fmt(r.deadline)}</span>}
                </span>
                {r && <span style={{ color: 'var(--ink-2)' }}>{msg(lang, r.reason)}</span>}
              </span>
            </div>
          );
        })}
        {p.payEnd !== undefined && (
          <span className="muted" style={{ fontSize: 12 }}>
            {tr(lang, p.pay2027 ? 'pf.pay2027' : p.payFrom === 'application' ? 'pf.pay.app' : 'pf.pay', { status: p.status, years: p.payYears ?? '', end: fmt(p.payEnd) })}
          </span>
        )}
      </div>
      <div className="detail-sec">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
          <span className="sec-title">{tr(lang, 'sa.inClient')}</span>
          <span className="tag ai" style={{ whiteSpace: 'normal' }}>{tr(lang, 'sa.aiTag')}</span>
        </div>
        {(() => {
          const c = app.sa.confirmed[p.zemis];
          const rows = SA_FIELDS.filter((f) => c?.[f.id]?.status === 'confirmed');
          if (!rows.length) return <span className="muted" style={{ fontSize: 13 }}>{tr(lang, 'sa.inClient.none')}</span>;
          return rows.map((f) => (
            <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, fontSize: 13 }} title={c![f.id].evidence}>
              <span className="muted">{lang === 'de' ? f.de : f.en}</span>
              <span style={{ fontWeight: 500, textAlign: 'right' }}>{saValue(lang, f.id, c![f.id].value)}</span>
            </div>
          ));
        })()}
      </div>
      <div className="detail-sec">
        <span className="sec-title">{tr(lang, 'cl.detail.trace')}</span>
        {Object.values(p.goals).flatMap((g) =>
          g!.trace.map((t, i) => (
            <div key={`${g!.goal}-${i}`} className="timeline-item">
              <span className="timeline-dot" aria-hidden="true" />
              <div style={{ display: 'flex', flexDirection: 'column', paddingBottom: 6 }}>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {t.rule}
                </span>
                <span style={{ fontSize: 13 }}>{msg(lang, t.msg)}</span>
              </div>
            </div>
          )),
        )}
      </div>
      <div className="detail-sec">
        <span className="sec-title">{tr(lang, 'cl.detail.rows')}</span>
        {[...sources.values()].map((s) => (
          <div key={`${s.table}:${s.row}`} style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {TABLE_BY_ID[s.table].name} · {tr(lang, 'dq.row')} {s.row}
            </span>
            <span>{srcLine(s)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
