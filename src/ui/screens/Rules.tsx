import { useEffect, useRef, useState } from 'react';
import { flattenRules } from '../../engine/rules';
import { tr } from '../strings';
import type { App } from '../useApp';

export function RulesDrawer({ app }: { app: App }) {
  const { lang } = app;
  const rows = flattenRules(app.rulesText);
  const fileRef = useRef<HTMLInputElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [err, setErr] = useState<string | undefined>();
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && app.setRulesOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [app]);
  return (
    <>
      <div className="drawer-back" onClick={() => app.setRulesOpen(false)} />
      <div className="drawer" role="dialog" aria-modal="true" aria-labelledby="rules-title">
        <div className="panel-head">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span id="rules-title" className="panel-title">
              {tr(lang, 'rules.title')} · v{app.rules.version}
            </span>
            <span className="muted" style={{ fontSize: 12, maxWidth: 520 }}>
              {tr(lang, 'rules.sub')}
            </span>
          </div>
          <button ref={closeRef} type="button" className="btn small" onClick={() => app.setRulesOpen(false)}>
            {tr(lang, 'rules.close')}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, padding: '10px 20px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', alignItems: 'center' }}>
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
            {tr(lang, 'rules.load')}
          </button>
          {app.customRules && (
            <button type="button" className="btn small" onClick={() => app.setRulesText(undefined)}>
              {tr(lang, 'rules.reset')}
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept=".yaml,.yml,.txt"
            className="sr"
            tabIndex={-1}
            aria-hidden="true"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                app.setRulesText(await f.text());
                setErr(undefined);
              } catch (x) {
                setErr(String(x));
              }
            }}
          />
          {err && <span className="tag bad">{tr(lang, 'rules.error', { e: err })}</span>}
        </div>
        <div className="drawer-body">
          <table className="t">
            <thead>
              <tr>
                <th scope="col">{tr(lang, 'rules.col.setting')}</th>
                <th scope="col">{tr(lang, 'rules.col.value')}</th>
                <th scope="col">{tr(lang, 'rules.col.note')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.path}>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {r.path}
                  </td>
                  <td className="mono" style={{ fontSize: 12, wordBreak: 'break-word' }}>
                    {r.value}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {/ASSUMPTION/.test(r.note) && <span className="tag warn">{tr(lang, 'rules.assumption')}</span>}
                    {/ORGANISERS/.test(r.note) && <span className="tag ai">{tr(lang, 'rules.organisers')}</span>}{' '}
                    <span className="muted">{r.note.replace(/(ASSUMPTION|ORGANISERS)\s*/, '')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
