import { TABLE_BY_ID } from '../../engine/import/signatures';
import { ALERT_META, type Alert, type AlertCode } from '../../engine/model';
import { msg } from '../../i18n/messages';
import { tr, type UiKey } from '../strings';
import type { App } from '../useApp';
import { EmptyRun } from './common';

const SEV_COLOR = { high: '#D12C1F', medium: '#B35C00', info: '#A1A1AA' };
const ORDER = { high: 0, medium: 1, info: 2 };

export function QualityScreen({ app }: { app: App }) {
  const { lang, result: res } = app;
  const open = app.dqOpen as AlertCode | undefined;
  const setOpen = app.setDqOpen;
  if (!res) return <EmptyRun app={app} />;
  const ids = new Set(app.visible!.persons.map((p) => p.id));
  const alerts = app.role.kind === 'mgmt' ? res.alerts : res.alerts.filter((a) => a.personId && ids.has(a.personId));
  const groups = new Map<AlertCode, Alert[]>();
  for (const a of alerts) groups.set(a.code, [...(groups.get(a.code) ?? []), a]);
  const sorted = [...groups.entries()].sort((a, b) => ORDER[a[1][0].severity] - ORDER[b[1][0].severity] || b[1].length - a[1].length);
  const byId = new Map(res.persons.map((p) => [p.id, p]));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr(lang, 'dq.title')}</h1>
          <p className="sub">{tr(lang, 'dq.sub')}</p>
        </div>
      </div>
      {!sorted.length ? (
        <div className="empty">{tr(lang, 'dq.none')}</div>
      ) : (
        <section className="panel">
          <div style={{ display: 'flex', gap: 16, padding: '10px 20px', fontSize: 12, color: 'var(--muted)', borderBottom: '1px solid var(--border)' }}>
            <span style={{ width: 84, flex: 'none' }}>{tr(lang, 'dq.col.sev')}</span>
            <span style={{ flex: 1 }}>{tr(lang, 'dq.col.issue')}</span>
            <span style={{ width: 90, flex: 'none' }}>{tr(lang, 'dq.col.affects')}</span>
            <span style={{ width: 60, flex: 'none', textAlign: 'right' }}>{tr(lang, 'dq.col.count')}</span>
            <span style={{ width: 90, flex: 'none' }} />
          </div>
          {sorted.map(([code, list]) => {
            const sev = list[0].severity;
            const isOpen = open === code;
            return (
              <div key={code} style={{ borderBottom: '1px solid var(--divider)' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, padding: '14px 20px', alignItems: 'flex-start' }}>
                  <span style={{ width: 84, flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                    <span className="dot" style={{ background: SEV_COLOR[sev] }} aria-hidden="true" />
                    {tr(lang, `dq.sev.${sev}` as UiKey)}
                  </span>
                  <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontWeight: 600 }}>{tr(lang, `dq.code.${code}` as UiKey)}</span>
                    <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{msg(lang, list[0].msg)}</span>
                  </div>
                  <span style={{ width: 90, flex: 'none', fontSize: 13, color: 'var(--ink-2)' }}>{tr(lang, `dq.affects.${ALERT_META[code].affects}` as UiKey)}</span>
                  <span className="num" style={{ width: 60, flex: 'none', textAlign: 'right', fontWeight: 600 }}>
                    {list.length}
                  </span>
                  <span style={{ width: 90, flex: 'none' }}>
                    <button type="button" className="btn small" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? undefined : code)}>
                      {tr(lang, isOpen ? 'dq.hide' : 'dq.review')}
                    </button>
                  </span>
                </div>
                {isOpen && (
                  <div className="scroll-x" style={{ borderTop: '1px solid var(--divider)', background: '#fcfcfb' }}>
                    <table className="t" style={{ minWidth: 640 }}>
                      <tbody>
                        {list.slice(0, 200).map((a, i) => {
                          const s = a.sources[0];
                          const p = a.personId ? byId.get(a.personId) : undefined;
                          return (
                            <tr
                              key={i}
                              className={p ? 'click' : undefined}
                              onClick={() => {
                                if (!p) return;
                                app.setSelected(p.id);
                                app.setScreen('clients');
                              }}
                            >
                              <td style={{ width: 180 }}>
                                {p ? (
                                  <>
                                    <div style={{ fontWeight: 500 }}>{p.displayName}</div>
                                    <div className="mono muted" style={{ fontSize: 12 }}>
                                      {p.klientNr} · {p.socialWorker}
                                    </div>
                                  </>
                                ) : (
                                  <span className="muted">{a.personId ?? '–'}</span>
                                )}
                              </td>
                              <td style={{ fontSize: 13 }}>{msg(lang, a.msg)}</td>
                              <td className="mono muted" style={{ fontSize: 12 }}>
                                {s ? `${TABLE_BY_ID[s.table].name} · ${tr(lang, 'dq.row')} ${s.row}` : ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
