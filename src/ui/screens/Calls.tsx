import { useState } from 'react';
import { fmt } from '../../engine/dates';
import type { CallItem } from '../../engine/model';
import { writeSocialWorker } from '../../excel/write';
import { msg } from '../../i18n/messages';
import { Icon } from '../icons';
import { tr } from '../strings';
import { download, type App } from '../useApp';
import { EmptyRun, GoalPills, PersonFacts } from './common';
import { SA_FIELDS } from '../../ai/extract';
import { saValue } from './Situation';

// Confirmed Situationsanalyse facts that can explain a flag (shown, never used to set a light).
export const BARRIER: Record<string, (v: unknown) => boolean> = {
  childcare_duty_without_care: (v) => v === 'yes',
  literate_latin_script: (v) => v === 'no',
  health_limits_work: (v) => v === 'some' || v === 'strong',
  availability_for_work_or_education: (v) => v === 'partial' || v === 'none',
  learning_pace: (v) => v === 'slow',
};

const LEAD_COLOR: Record<CallItem['category'], string> = { 1: 'var(--risk)', 2: 'var(--missed)', 3: 'var(--track-text)', 4: 'var(--accent-hover)', 5: 'var(--ink-2)' };

export function CallsScreen({ app }: { app: App }) {
  const { lang, result: res } = app;
  const [showAll, setShowAll] = useState(false);
  if (!res) return <EmptyRun app={app} />;
  const locked = app.role.kind === 'sw' ? app.role.name : undefined;
  const sw = locked ?? app.callsSw ?? res.socialWorkers[0];
  const items = res.callLists[sw] ?? [];
  const top = app.rules.calls.top_n;
  const shown = showAll ? items : items.slice(0, top);
  const byId = new Map(res.persons.map((p) => [p.id, p]));
  const sel = shown.find((c) => c.personId === app.selected) ?? shown[0];
  const p = sel ? byId.get(sel.personId) : undefined;

  const when = (c: CallItem) => {
    if (c.keyDate === undefined) return '';
    if (c.category === 3) return fmt(c.keyDate);
    const d = c.daysLeft ?? 0;
    return `${fmt(c.keyDate)} · ${d >= 0 ? tr(lang, 'calls.days', { n: d }) : tr(lang, 'calls.daysAgo', { n: -d })}`;
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr(lang, 'calls.title')}</h1>
          <p className="sub">{tr(lang, 'calls.sub', { top: Math.min(top, items.length), n: items.length, sw })}</p>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <label htmlFor="calls-sw" className="sr">
            {tr(lang, 'ov.col.sw')}
          </label>
          <select id="calls-sw" className="input" value={sw} disabled={!!locked} onChange={(e) => app.setCallsSw(e.target.value)}>
            {(locked ? [locked] : res.socialWorkers).map((s) => (
              <option key={s} value={s}>
                {s} ({res.callLists[s]?.length ?? 0})
              </option>
            ))}
          </select>
          <button type="button" className="btn" onClick={() => setShowAll(!showAll)} disabled={items.length <= top}>
            {showAll ? tr(lang, 'calls.showTop', { n: top }) : tr(lang, 'calls.showAll', { n: items.length })}
          </button>
          <button type="button" className="btn" onClick={async () => {
            const f = await writeSocialWorker(res, sw, app.rulesText);
            download(f.name, f.buffer);
          }}>
            {Icon.download()} {tr(lang, 'calls.export')}
          </button>
        </div>
      </div>

      {!items.length ? (
        <div className="empty">{tr(lang, 'calls.none')}</div>
      ) : (
        <div className="split">
          <div className="split-list">
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 18px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
              <span>{tr(lang, 'calls.client')}</span>
              <span>G1 · G2 · G3</span>
            </div>
            {shown.map((c, i) => {
              const q = byId.get(c.personId)!;
              return (
                <button key={c.personId} type="button" className="call-row" aria-pressed={sel?.personId === c.personId} onClick={() => app.setSelected(c.personId)}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, width: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flexWrap: 'wrap' }}>
                      <span className="mono muted" style={{ fontSize: 12, width: 18 }}>
                        {i + 1}
                      </span>
                      <span style={{ fontWeight: 600 }}>{q.displayName}</span>
                      <span className="mono muted" style={{ fontSize: 12 }}>
                        {q.klientNr}
                      </span>
                      <span className="tag">{tr(lang, `calls.cat.${c.category}` as 'calls.cat.1')}</span>
                      {app.called[c.personId] && <span className="tag good">{tr(lang, 'calls.called')}</span>}
                    </div>
                    <GoalPills app={app} p={q} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%', fontSize: 13, paddingLeft: 26 }}>
                    <span style={{ color: LEAD_COLOR[c.category], fontWeight: 500 }}>{msg(lang, c.lead)}</span>
                    <span className="muted" style={{ textAlign: 'right', flex: 'none' }}>
                      {when(c)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {sel && p && (
            <aside className="split-detail" aria-label="Details">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 18, fontWeight: 600 }}>{p.displayName}</span>
                  <span className="mono muted" style={{ fontSize: 12 }}>
                    {p.klientNr} · Zemis {p.zemis} · {p.dossierNr} · {p.status}
                  </span>
                </div>
                <button type="button" className={`btn small${app.called[p.id] ? ' primary' : ''}`} aria-pressed={!!app.called[p.id]} onClick={() => app.toggleCalled(p.id)}>
                  {app.called[p.id] ? tr(lang, 'calls.called') : tr(lang, 'calls.markCalled')}
                </button>
              </div>
              <div className="detail-sec">
                <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <span className="sec-title">{tr(lang, 'calls.why')}</span>
                  <span className="tag">{tr(lang, 'calls.rulesDecide')}</span>
                </div>
                <p style={{ margin: 0, fontSize: 15, lineHeight: 1.55 }}>{msg(lang, sel.lead)}</p>
                {(() => {
                  // Situationsanalyse barriers: confirmed ones, and model proposals (labelled) that a person can confirm here.
                  const c = app.sa.confirmed[p.zemis];
                  let ext: (typeof app.sa.extr)[string]['persons'][number] | undefined;
                  let file = '';
                  for (const [f, r] of Object.entries(app.sa.extr)) {
                    const hit = r.persons.find((x) => x.zemis === p.zemis);
                    if (hit) {
                      ext = hit;
                      file = f;
                    }
                  }
                  const rows = SA_FIELDS.filter((f) => BARRIER[f.id]).flatMap((f) => {
                    const cf = c?.[f.id];
                    if (cf?.status === 'confirmed') return BARRIER[f.id](cf.value) ? [{ f, value: cf.value, evidence: cf.evidence, confirmed: true }] : [];
                    if (cf) return [];
                    const e = ext?.fields[f.id];
                    return e && e.status === 'stated' && BARRIER[f.id](e.value) ? [{ f, value: e.value, evidence: e.evidence, confirmed: false }] : [];
                  });
                  if (!rows.length) return null;
                  return rows.map((r) => (
                    <div key={r.f.id} style={{ fontSize: 13, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 4, padding: '8px 10px', borderRadius: 6, background: r.confirmed ? '#F6FAF7' : '#FBFBFA', border: '1px solid var(--divider)' }}>
                      <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                        {lang === 'de' ? r.f.de : r.f.en}: {saValue(lang, r.f.id, r.value)}
                      </span>
                      <span style={{ background: '#FFF6D6', alignSelf: 'flex-start' }} lang="de">«{r.evidence}»</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="tag ai" style={{ whiteSpace: 'normal' }}>{r.confirmed ? tr(lang, 'sa.aiTag') : tr(lang, 'calls.saProposal')}</span>
                        {!r.confirmed && ext && (
                          <button type="button" className="btn small" onClick={() => app.sa.setField(p.zemis, r.f.id, ext!.fields[r.f.id], file, 'confirmed')}>
                            {tr(lang, 'calls.confirm')}
                          </button>
                        )}
                      </span>
                    </div>
                  ));
                })()}
                {sel.reasons.filter((r) => JSON.stringify(r) !== JSON.stringify(sel.lead)).length > 0 && (
                  <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                    {tr(lang, 'calls.more')}:{' '}
                    {sel.reasons
                      .filter((r) => JSON.stringify(r) !== JSON.stringify(sel.lead))
                      .map((r) => msg(lang, r))
                      .join(' · ')}
                  </div>
                )}
              </div>
              <div className="detail-sec">
                <span className="sec-title">{tr(lang, 'calls.talking')}</span>
                {sel.talkingPoints.map((t, i) => (
                  <label key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, minHeight: 28 }}>
                    <input type="checkbox" style={{ width: 16, height: 16, margin: '2px 0 0', accentColor: '#121212' }} />
                    <span>{msg(lang, t)}</span>
                  </label>
                ))}
                <span className="muted" style={{ fontSize: 12 }}>
                  {tr(lang, 'calls.localOnly')}
                </span>
              </div>
              <PersonFacts app={app} p={p} />
            </aside>
          )}
        </div>
      )}
    </>
  );
}
