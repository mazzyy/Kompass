import { useMemo, useState } from 'react';
import { fmt } from '../../engine/dates';
import type { GoalId, Status } from '../../engine/model';
import { msg } from '../../i18n/messages';
import { statusLabel, tr } from '../strings';
import type { App } from '../useApp';
import { EmptyRun, GoalPills, PersonFacts } from './common';

const PAGE = 100;

export function ClientsScreen({ app }: { app: App }) {
  const { lang, result: res } = app;
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<'' | Status | 'reached_late'>('');
  const [goal, setGoal] = useState<GoalId>(1);
  const [sw, setSw] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const persons = app.visible?.persons ?? [];
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    return persons.filter((p) => {
      if (sw && p.socialWorker !== sw) return false;
      if (app.inScopeOnly && !Object.values(p.goals).some((r) => r && r.status !== 'not_applicable')) return false;
      const g = p.goals[goal];
      if (status === 'reached_late' && !(g?.status === 'reached' && g.late)) return false;
      if (status && status !== 'reached_late' && g?.status !== status) return false;
      if (s && ![p.displayName, p.klientNr, p.zemis, p.dossierNr].some((x) => x.toLowerCase().includes(s))) return false;
      return true;
    });
  }, [persons, q, status, sw, goal, app.inScopeOnly]);
  if (!res) return <EmptyRun app={app} />;
  const sel = persons.find((p) => p.id === app.selected);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr(lang, 'cl.title')}</h1>
          <p className="sub">{tr(lang, 'cl.sub')}</p>
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ flex: '2 1 300px' }}>
          <label htmlFor="cl-q">{tr(lang, 'cl.search')}</label>
          <input id="cl-q" className="input" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="field" style={{ flex: '0 1 140px' }}>
          <label htmlFor="cl-goal">{tr(lang, 'cl.filter.goal')}</label>
          <select id="cl-goal" className="input" value={goal} onChange={(e) => setGoal(Number(e.target.value) as GoalId)}>
            {([1, 2, 3] as GoalId[]).map((g) => (
              <option key={g} value={g}>
                {tr(lang, `goal.${g}` as 'goal.1')}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="cl-st">{tr(lang, 'cl.filter.status')}</label>
          <select id="cl-st" className="input" value={status} onChange={(e) => setStatus(e.target.value as Status)}>
            <option value="">{tr(lang, 'cl.filter.all')}</option>
            {(['at_risk', 'missed', 'on_track', 'reached', 'reached_late', 'no_data', 'not_applicable'] as const).map((s) => (
              <option key={s} value={s}>
                {s === 'reached_late' ? statusLabel(lang, 'reached', true) : statusLabel(lang, s)}
              </option>
            ))}
          </select>
        </div>
        {app.role.kind === 'mgmt' && (
          <div className="field">
            <label htmlFor="cl-sw">{tr(lang, 'cl.filter.sw')}</label>
            <select id="cl-sw" className="input" value={sw} onChange={(e) => setSw(e.target.value)}>
              <option value="">{tr(lang, 'cl.filter.all')}</option>
              {res.socialWorkers.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, paddingBottom: 8, minHeight: 36 }}>
          <input type="checkbox" checked={app.inScopeOnly} onChange={(e) => app.setInScopeOnly(e.target.checked)} style={{ width: 16, height: 16, accentColor: '#1a1a1a' }} />
          {tr(lang, 'cl.inScopeOnly')}
        </label>
        <span className="muted" style={{ fontSize: 13, paddingBottom: 8 }} role="status">
          {tr(lang, 'cl.count', { n: list.length, total: persons.length })}
        </span>
      </div>
      <div className="split">
        <div className="split-list scroll-x" style={{ flex: '2 1 560px' }}>
          <table className="t" style={{ minWidth: 640 }}>
            <thead>
              <tr>
                <th scope="col">{tr(lang, 'cl.col.client')}</th>
                <th scope="col">G1 · G2 · G3</th>
                <th scope="col">{tr(lang, 'cl.col.status')}</th>
                <th scope="col">{tr(lang, 'cl.col.deadline')}</th>
                <th scope="col">{tr(lang, 'cl.col.reason')}</th>
              </tr>
            </thead>
            <tbody>
              {list.slice(0, limit).map((p) => (
                <tr
                  key={p.id}
                  className={`click${sel?.id === p.id ? ' sel' : ''}`}
                  tabIndex={0}
                  onClick={() => app.setSelected(p.id)}
                  onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), app.setSelected(p.id))}
                  aria-selected={sel?.id === p.id}
                >
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.displayName}</div>
                    <div className="mono muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                      {p.klientNr} · {p.socialWorker}
                    </div>
                  </td>
                  <td>
                    <GoalPills app={app} p={p} />
                  </td>
                  <td>{p.status}</td>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {fmt(p.goals[goal]?.deadline)}
                  </td>
                  <td style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{msg(lang, p.goals[goal]?.reason)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.length > limit && (
            <div style={{ padding: 12 }}>
              <button type="button" className="btn" onClick={() => setLimit(limit + PAGE)}>
                {tr(lang, 'cl.more', { n: Math.min(PAGE, list.length - limit) })}
              </button>
            </div>
          )}
        </div>
        {sel && (
          <aside className="split-detail" aria-label="Details" style={{ flex: '1 1 380px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, padding: '16px 22px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 18, fontWeight: 600 }}>{sel.displayName}</span>
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {sel.klientNr} · Zemis {sel.zemis} · {sel.dossierNr}
                </span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {sel.status} · {tr(lang, 'cl.col.entry')} {fmt(sel.entry) || '–'} · {sel.socialWorker}
                </span>
              </div>
              <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <button type="button" className="btn small primary" onClick={() => app.openClient(sel.id)}>
                  {tr(lang, 'cp.open')}
                </button>
                <button type="button" className="btn small" onClick={() => app.setSelected(undefined)}>
                  {tr(lang, 'cl.close')}
                </button>
              </span>
            </div>
            <PersonFacts app={app} p={sel} />
          </aside>
        )}
      </div>
    </>
  );
}
