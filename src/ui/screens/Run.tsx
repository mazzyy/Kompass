import { useRef, useState } from 'react';
import { fmt, parseDate } from '../../engine/dates';
import type { MappingSuggestion } from '../../engine/import/detect';
import { TABLES, TABLE_BY_ID } from '../../engine/import/signatures';
import { msg } from '../../i18n/messages';
import { Icon } from '../icons';
import { tr } from '../strings';
import { droppedFolder } from '../source';
import type { App } from '../useApp';

function Stepper({ app }: { app: App }) {
  const cur = !app.raws.length ? 0 : app.blocked ? 1 : !app.result ? 2 : 3;
  const names = ['run.step1', 'run.step2', 'run.step3', 'run.step4'] as const;
  return (
    <ol className="stepper" aria-label="Schritte">
      {names.map((n, i) => (
        <li key={n}>
          <span className={`step-dot${i < cur || (i === 3 && app.result) ? ' done' : i === cur ? ' cur' : ''}`} aria-hidden="true">
            {i + 1}
          </span>
          <span style={{ fontWeight: i === cur ? 500 : 400, color: i <= cur ? 'var(--ink)' : 'var(--muted)' }} aria-current={i === cur ? 'step' : undefined}>
            {tr(app.lang, n)}
          </span>
          {i < 3 && <span className="step-line" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

function ColumnChange({ app, s }: { app: App; s: MappingSuggestion }) {
  const { lang } = app;
  const raw = app.raws.find((r) => r.headers.map(String).includes(s.fileHeader));
  const [choice, setChoice] = useState(s.fileHeader);
  const [choosing, setChoosing] = useState(false);
  const spec = TABLE_BY_ID[s.table];
  return (
    <section className="panel" aria-label={tr(lang, 'run.colchange', { table: spec.name })}>
      <div className="panel-head">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {Icon.warn()}
          <span className="panel-title">{tr(lang, 'run.colchange', { table: spec.name })}</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {tr(lang, 'run.colchange.sub')}
          </span>
        </div>
        <span className={`tag${s.suggestedBy === 'ai' ? ' ai' : ''}`}>{tr(lang, s.suggestedBy === 'ai' ? 'run.suggestedAi' : 'run.suggestedRules')}</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px 32px', padding: 18 }}>
        <div className="diff">
          <div className="minus">
            − {s.expectedHeader} <span className="muted">· {tr(lang, 'run.expected')}</span>
          </div>
          <div className="plus">
            + {choice} <span className="muted">· {tr(lang, 'run.inFile')}</span>
          </div>
        </div>
        <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13, color: 'var(--ink-2)' }}>
          <span>{tr(lang, s.profileOk === false ? 'run.ev.valuesNo' : 'run.ev.values', { samples: s.samples.join(', ') })}</span>
          <span>{tr(lang, 'run.ev.rows', { n: app.analyses.find((a) => a.table === s.table)?.rows ?? 0 })}</span>
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 18px 18px', alignItems: 'center' }}>
        <button type="button" className="btn primary" onClick={() => app.acceptMapping({ ...s, fileHeader: choice })}>
          {tr(lang, 'run.accept')}
        </button>
        {!choosing ? (
          <button type="button" className="btn" onClick={() => setChoosing(true)}>
            {tr(lang, 'run.choose')}
          </button>
        ) : (
          <>
            <label htmlFor={`col-${s.table}-${s.colKey}`} className="sr">
              {tr(lang, 'run.choose')}
            </label>
            <select id={`col-${s.table}-${s.colKey}`} className="input" value={choice} onChange={(e) => setChoice(e.target.value)}>
              {(raw?.headers ?? []).map(String).filter(Boolean).map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </>
        )}
      </div>
    </section>
  );
}

export function RunScreen({ app }: { app: App }) {
  const { lang } = app;
  const fileRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [cleared, setCleared] = useState(false);
  const found = new Map(app.analyses.filter((a) => a.table && a.status !== 'duplicate').map((a) => [a.table!, a]));
  const suggestions = app.analyses.flatMap((a) => (a.status === 'needs_confirmation' ? a.suggestions.filter((s) => s.required) : []));
  const res = app.result;
  const hint = !app.raws.length ? 'run.hint.files' : app.blocked ? 'run.hint.mapping' : 'run.hint.ready';

  const checkText = (a: (typeof app.analyses)[number]) => {
    switch (a.status) {
      case 'ok':
        return tr(lang, 'run.check.ok');
      case 'mapped':
        return tr(lang, 'run.check.mapped');
      case 'needs_confirmation':
        return tr(lang, 'run.check.needs');
      case 'missing_required':
        return tr(lang, 'run.check.missingReq', { cols: a.missingColumns.filter((m) => m.required).map((m) => m.header).join(', ') });
      case 'duplicate':
        return tr(lang, 'run.check.duplicate');
      default:
        return tr(lang, 'run.check.unknown');
    }
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr(lang, 'run.title')}</h1>
          <p className="sub">{tr(lang, 'run.sub')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="muted" style={{ fontSize: 13 }}>
            {tr(lang, hint)}
          </span>
          <button type="button" className="btn primary" disabled={!app.raws.length || app.blocked || app.running} onClick={app.doRun}>
            {Icon.play()} {tr(lang, res ? 'run.again' : 'run.button')}
          </button>
        </div>
      </div>

      <Stepper app={app} />

      {app.error && (
        <div className="note" role="alert">
          {tr(lang, 'misc.error', { e: app.error })}
        </div>
      )}

      <SourcePanel app={app} />

      {suggestions.map((s) => (
        <ColumnChange key={`${s.table}-${s.colKey}-${s.fileHeader}`} app={app} s={s} />
      ))}

      <div
        className={`drop${over ? ' over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={async (e) => {
          e.preventDefault();
          setOver(false);
          const files = e.dataTransfer.files;
          const dir = await droppedFolder(e.dataTransfer);
          if (dir) void app.openFolder(dir);
          else app.addFiles(files);
        }}
      >
        <span style={{ fontWeight: 600 }}>{tr(lang, 'run.drop')}</span>
        <span className="muted" style={{ fontSize: 13, maxWidth: 520 }}>
          {tr(lang, 'run.drop.sub')}
        </span>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
            {tr(lang, 'run.pickFiles')}
          </button>
          <button type="button" className="btn" onClick={() => (app.canRememberFolder ? app.chooseFolder() : dirRef.current?.click())}>
            {tr(lang, 'run.pickFolder')}
          </button>
          <input ref={fileRef} type="file" multiple accept=".xlsx,.xls,.xlsm,.csv" className="sr" tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.files && app.addFiles(e.target.files)} />
          <input
            ref={dirRef}
            type="file"
            multiple
            className="sr"
            tabIndex={-1}
            aria-hidden="true"
            {...({ webkitdirectory: '', directory: '' } as Record<string, string>)}
            onChange={(e) => e.target.files && app.addFiles(e.target.files)}
          />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
          <span className="muted">{tr(lang, 'run.sample')}</span>
          <button type="button" className="btn small" onClick={() => app.loadSample('2026-10')}>
            {tr(lang, 'run.sampleOct')}
          </button>
          <button type="button" className="btn small" onClick={() => app.loadSample('2026-11')}>
            {tr(lang, 'run.sampleNov')}
          </button>
          <a className="btn small" href="./sample-data.zip" download>
            {tr(lang, 'run.sampleZip')}
          </a>
        </div>
        {app.loading && <span className="muted">{tr(lang, 'misc.loading')}</span>}
      </div>

      {app.raws.length > 0 && (
        <section className="panel" aria-label={tr(lang, 'run.exports')}>
          <div className="panel-head">
            <span className="panel-title">{tr(lang, 'run.exports')}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{tr(lang, 'run.tablesFound', { n: found.size })}</span>
          </div>
          <div className="scroll-x">
            <table className="t" style={{ minWidth: 640 }}>
              <thead>
                <tr>
                  <th scope="col">{tr(lang, 'run.col.table')}</th>
                  <th scope="col">{tr(lang, 'run.col.file')}</th>
                  <th scope="col" className="r">
                    {tr(lang, 'run.col.rows')}
                  </th>
                  <th scope="col">{tr(lang, 'run.col.check')}</th>
                </tr>
              </thead>
              <tbody>
                {TABLES.map((t) => {
                  const a = found.get(t.id);
                  const ok = a && (a.status === 'ok' || a.status === 'mapped');
                  return (
                    <tr key={t.id}>
                      <td>
                        <span style={{ fontWeight: 500 }}>{lang === 'en' ? `${t.name} (${t.nameEn})` : t.name}</span>
                        {t.provisional && (
                          <div className="muted" style={{ fontSize: 12 }}>
                            {tr(lang, 'run.provisional')}
                          </div>
                        )}
                      </td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all' }}>
                        {a?.fileName ?? '–'}
                      </td>
                      <td className="r">{a ? a.rows.toLocaleString('de-CH') : '–'}</td>
                      <td>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: ok ? 'var(--reached-text)' : a ? 'var(--track-text)' : 'var(--muted)' }}>
                          {ok ? Icon.ok() : a ? Icon.warn() : null}
                          {a ? checkText(a) : tr(lang, 'run.check.missingTable')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
                {app.analyses
                  .filter((a) => !a.table || a.status === 'duplicate')
                  .map((a) => (
                    <tr key={a.fileName}>
                      <td className="muted">–</td>
                      <td className="mono" style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {a.fileName}
                      </td>
                      <td className="r">{a.rows}</td>
                      <td style={{ color: 'var(--track-text)' }}>{checkText(a)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="panel" aria-label={tr(lang, 'run.settings')}>
        <div className="row" style={{ padding: '16px 20px' }}>
          <div className="field">
            <label htmlFor="stichtag">{tr(lang, 'top.stichtag')}</label>
            <input
              id="stichtag"
              className="input mono"
              placeholder={app.autoStichtag !== undefined ? fmt(app.autoStichtag) : 'dd.mm.yyyy'}
              defaultValue=""
              onChange={(e) => app.setStichtagOverride(parseDate(e.target.value))}
              aria-describedby="stichtag-help"
            />
            <span id="stichtag-help" className="muted" style={{ fontSize: 12 }}>
              {app.autoStichtag !== undefined ? tr(lang, 'run.stichtag.auto', { date: fmt(app.autoStichtag) }) : 'dd.mm.yyyy'}
            </span>
          </div>
          <div className="field">
            <label htmlFor="window">{tr(lang, 'run.window')}</label>
            <select id="window" className="input" value={app.windowMonths} onChange={(e) => app.setWindowMonths(Number(e.target.value))}>
              {[3, 6, 9, 12].map((n) => (
                <option key={n} value={n}>
                  {tr(lang, 'run.months', { n })}
                </option>
              ))}
            </select>
            <span className="muted" style={{ fontSize: 12 }}>
              rules.yaml: at_risk_window_months = {app.rules.at_risk_window_months}
            </span>
          </div>
          <div className="field">
            <span className="label">{tr(lang, 'run.output')}</span>
            <span className="input" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg-app)', fontSize: 13 }}>
              {tr(lang, 'run.output.value')}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>
              {tr(lang, 'run.mappingSaved')}{' '}
              <button
                type="button"
                className="btn link"
                style={{ fontSize: 12 }}
                onClick={() => {
                  app.clearLocal();
                  setCleared(true);
                }}
              >
                {tr(lang, 'run.clear')}
              </button>
              {cleared && <span role="status"> {tr(lang, 'run.clear.done')}</span>}
            </span>
          </div>
        </div>
      </section>

      {app.log.length > 0 && (
        <section className="log" aria-live="polite" aria-label="Log">
          <div className="log-bar">
            <div style={{ width: `${Math.round(app.progress * 100)}%` }} />
          </div>
          <div className="log-lines">
            {app.log.map((l, i) => (
              <div key={i} style={{ display: 'flex', gap: 14 }}>
                <span style={{ color: '#8E8E96' }}>{l.t}</span>
                <span style={{ color: l.state === 'done' ? '#6FCF97' : '#F2C94C' }}>{l.state === 'done' ? '✓' : '›'}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {res && (
        <section className="panel">
          <div className="kpis">
            <div className="kpi">
              <span className="kpi-label">{tr(lang, 'run.sum.scope')}</span>
              <span className="kpi-value">{res.totals[1]?.overall.counted ?? '–'}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{tr(lang, 'run.sum.red')}</span>
              <span className="kpi-value" style={{ color: 'var(--risk)' }}>
                {res.totals[1] ? res.totals[1].overall.counts.at_risk + res.totals[1].overall.counts.missed : '–'}
              </span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{tr(lang, 'run.sum.alerts')}</span>
              <span className="kpi-value">{res.alerts.length}</span>
            </div>
            <div className="kpi">
              <span className="kpi-label">{tr(lang, 'run.sum.files')}</span>
              <span className="kpi-value">{app.files.length}</span>
            </div>
          </div>
          {res.notes.length > 0 && (
            <div style={{ padding: '0 20px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {res.notes.map((n, i) => (
                <div key={i} className="note">
                  {msg(lang, n)}
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '12px 20px', borderTop: '1px solid var(--divider)' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{tr(lang, 'run.sum.ready', { n: app.files.length })}</span>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button type="button" className="btn" onClick={() => app.setScreen('export')}>
                {Icon.download()} {tr(lang, 'nav.export')}
              </button>
              <button type="button" className="btn" onClick={() => app.setScreen('calls')}>
                {tr(lang, 'run.toCalls')}
              </button>
              <button type="button" className="btn primary" onClick={() => app.setScreen('overview')}>
                {tr(lang, 'run.toOverview')}
              </button>
            </div>
          </div>
        </section>
      )}
    </>
  );
}

function SourcePanel({ app }: { app: App }) {
  const { lang, source } = app;
  if (app.folderWaiting)
    return (
      <div className="note info" role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: '1 1 300px' }}>
          <strong>{tr(lang, 'src.title')}:</strong> {tr(lang, 'src.folder', { name: app.folderWaiting })}. {tr(lang, 'src.reopen.sub')}
        </span>
        <button type="button" className="btn primary" onClick={app.reopenFolder}>
          {tr(lang, 'src.reopen', { name: app.folderWaiting })}
        </button>
        <button type="button" className="btn" onClick={app.forgetSource}>
          {tr(lang, 'src.forget')}
        </button>
      </div>
    );
  if (!source) return app.canRememberFolder ? null : <div className="note">{tr(lang, 'src.noDirApi')}</div>;
  if (source.kind === 'files')
    return (
      <div className="note" role="status">
        {tr(lang, 'src.files.note')}
        {!app.canRememberFolder && ` ${tr(lang, 'src.noDirApi')}`}
      </div>
    );
  const name = source.kind === 'sample' ? tr(lang, 'src.sample', { month: source.month === '2026-10' ? 'Oktober 2026' : 'November 2026' }) : tr(lang, 'src.folder', { name: source.name });
  return (
    <div className="note info" role="status" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: '1 1 300px' }}>
        <strong>{tr(lang, 'src.title')}:</strong> {name}. {tr(lang, 'src.locked.sub')}
      </span>
      <button type="button" className="btn" onClick={app.forgetSource}>
        {tr(lang, 'src.forget')}
      </button>
    </div>
  );
}
