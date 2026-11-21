import { useEffect, useMemo, useRef, useState } from 'react';
import { norm, SA_FIELDS, type Extracted, type PersonExtraction, type SaFieldId } from '../../ai/extract';
import type { Lang } from '../../i18n/messages';
import { pct, tr, type UiKey } from '../strings';
import type { App } from '../useApp';
import type { Confirmed } from '../useSa';

export function saValue(lang: Lang, f: SaFieldId, v: unknown): string {
  if (v === null || v === undefined) return '';
  if (f === 'work_experience_years_origin') return tr(lang, 'sa.years', { n: Number(v) });
  if (f === 'career_wish') return String(v);
  return tr(lang, `sa.val.${v}` as UiKey);
}

const fdate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Report rendered as a page; evidence sentences highlighted. */
function ReportView({ text, evidence, selected, zemis }: { text: string; evidence: string[]; selected?: string; zemis?: string }) {
  // Merge lines wrapped by the PDF layout back into paragraphs (headings stay on their own line).
  const isHead = (l: string) => /^\d+\.(\d+)?\s/.test(l) || l.startsWith('Situationsanalyse und Potenzialerhebung');
  const lines: string[] = [];
  text.split('\n').forEach((l, i) => {
    const t = l.trim();
    if (!t) return;
    const prev = lines[lines.length - 1];
    if (i > 2 && prev !== undefined && lines.length > 2 && !isHead(t) && !isHead(prev) && !/^(Name|Datum):/.test(t)) lines[lines.length - 1] = `${prev} ${t}`;
    else lines.push(t);
  });
  const ev = evidence.map(norm).filter(Boolean);
  const sel = selected ? norm(selected) : undefined;
  const mark = (line: string) => {
    // split the line into sentences and highlight those that are evidence
    const parts = line.split(/(?<=[.!?])\s+(?=[A-ZÄÖÜ])/);
    return parts.map((p, i) => {
      const n = norm(p);
      const isSel = !!sel && (n === sel || n.includes(sel) || sel.includes(n));
      const isEv = ev.some((e) => n === e || n.includes(e) || (e.includes(n) && n.length > 12));
      return (
        <span key={i} style={isSel ? { background: '#FFE58F', boxShadow: '0 0 0 2px #FFE58F', borderRadius: 2 } : isEv ? { background: '#FFF6D6' } : undefined}>
          {p}
          {i < parts.length - 1 ? ' ' : ''}
        </span>
      );
    });
  };
  let active = false; // only highlight inside the selected person's section
  return (
    <article lang="de" style={{ background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,.08)', borderRadius: 4, padding: '28px 32px', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13.5 }}>
      {lines.map((l, i) => {
        if (i < 2) return <div key={i} className="muted" style={{ fontSize: 11 }}>{l}</div>;
        if (l.startsWith('Situationsanalyse und Potenzialerhebung')) return <div key={i} style={{ fontSize: 16, fontWeight: 600, marginTop: 6 }}>{l}</div>;
        if (/^\d+\.\d+\s/.test(l)) return <div key={i} style={{ fontSize: 12, fontWeight: 600, padding: '3px 8px', background: '#F1F0EC', marginTop: 4 }}>{l}</div>;
        if (/^\d+\.\s/.test(l)) {
          const m = l.match(/Potenzialerhebung.*\(Zemis-Nr\.\s*(\d+)\)/);
          active = !!m && m[1] === zemis;
          return <div key={i} style={{ fontWeight: 600, marginTop: 10 }}>{l}</div>;
        }
        return <p key={i} style={{ margin: 0, lineHeight: 1.7 }}>{active ? mark(l) : l}</p>;
      })}
    </article>
  );
}

function FieldRow({ app, p, f, e, file, sel, onPick }: { app: App; p: PersonExtraction; f: (typeof SA_FIELDS)[number]; e: Extracted; file: string; sel: boolean; onPick: () => void }) {
  const { lang, sa } = app;
  const c: Confirmed | undefined = sa.confirmed[p.zemis]?.[f.id];
  const stated = e.status !== 'not_stated';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 18px', borderBottom: '1px solid var(--divider)', background: sel ? '#FFF7DB' : '#fff' }}>
      <button type="button" onClick={onPick} aria-pressed={sel} style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer' }}>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{lang === 'de' ? f.de : f.en}</span>
        <span style={{ fontSize: 14, fontWeight: 500, color: stated ? 'var(--ink)' : 'var(--muted)', fontStyle: stated ? 'normal' : 'italic' }}>
          {stated ? saValue(lang, f.id, e.value) : tr(lang, 'sa.notStated')}
          {e.status === 'unclear' && <span className="tag warn" style={{ marginLeft: 8 }}>{tr(lang, 'sa.unclear')}</span>}
        </span>
      </button>
      {c ? (
        <button type="button" className="btn small" aria-pressed="true" style={{ background: '#EAF5EE', borderColor: '#B9DEC8', color: '#145F35' }} onClick={() => sa.setField(p.zemis, f.id, e, file, undefined)}>
          {tr(lang, c.status === 'confirmed' ? 'sa.confirmed' : 'sa.leftEmpty')}
        </button>
      ) : (
        <button type="button" className="btn small" onClick={() => sa.setField(p.zemis, f.id, e, file, e.status === 'stated' ? 'confirmed' : 'left_empty')}>
          {tr(lang, e.status === 'stated' ? 'sa.confirm' : 'sa.leaveEmpty')}
        </button>
      )}
    </div>
  );
}

export function SituationScreen({ app, aiOnline }: { app: App; aiOnline: boolean }) {
  const { lang, sa } = app;
  const fileRef = useRef<HTMLInputElement>(null);
  const sw = app.role.kind === 'sw' ? app.role.name : undefined;
  const reports = useMemo(() => sa.reports.filter((r) => !sw || !r.socialWorker || r.socialWorker === sw), [sa.reports, sw]);
  const newOnes = reports.filter((r) => r.newThisMonth);
  const cur = reports.find((r) => r.file === sa.current) ?? newOnes[0] ?? reports[0];
  const [personIdx, setPersonIdx] = useState(0);
  const [field, setField] = useState<SaFieldId | undefined>();
  useEffect(() => {
    if (cur) sa.ensureText(cur.file);
    setPersonIdx(0);
    setField(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur?.file]);

  const ex = cur ? sa.extr[cur.file] : undefined;
  const live = cur && sa.busy === cur.file;
  const persons = live ? sa.livePersons : (ex?.persons ?? []);
  const p = persons[Math.min(personIdx, Math.max(0, persons.length - 1))];
  const evidence = p ? SA_FIELDS.map((f) => p.fields[f.id].evidence).filter(Boolean) : [];
  const decided = p ? SA_FIELDS.filter((f) => sa.confirmed[p.zemis]?.[f.id]).length : 0;
  const nPersons = cur?.text ? (cur.text.match(/Individuelle\s+Potenzialerhebung/g) ?? []).length : 0;
  const i = cur ? reports.indexOf(cur) : -1;
  const client = p ? app.result?.persons.find((x) => x.zemis === p.zemis) : undefined;
  const acc = sa.accuracy;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr(lang, 'sa.title')}</h1>
          <p className="sub">{tr(lang, 'sa.sub')}</p>
          <p style={{ margin: '8px 0 0', fontSize: 13 }}>
            <span className="tag ai">{acc ? tr(lang, 'sa.accuracy', { pct: pct(acc.accuracy), n: acc.reports, model: acc.model, date: fdate(acc.measuredAt).slice(0, 10) }) : tr(lang, 'sa.accuracy.none')}</span>
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {reports.length > 0 && (
            <>
              <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
                {tr(lang, 'sa.reportOf', { i: i + 1, n: reports.length })} · {tr(lang, 'sa.new', { n: newOnes.length })}
              </span>
              <button type="button" className="btn small" aria-label={tr(lang, 'sa.prev')} disabled={i <= 0} onClick={() => sa.setCurrent(reports[i - 1].file)}>
                ‹
              </button>
              <button type="button" className="btn small" aria-label={tr(lang, 'sa.next')} disabled={i >= reports.length - 1} onClick={() => sa.setCurrent(reports[i + 1].file)}>
                ›
              </button>
              <label htmlFor="sa-pick" className="sr">
                {tr(lang, 'sa.pick')}
              </label>
              <select id="sa-pick" className="input" style={{ maxWidth: 220 }} value={cur?.file} onChange={(e) => sa.setCurrent(e.target.value)}>
                {reports.map((r) => (
                  <option key={r.file} value={r.file}>
                    {r.label}
                    {r.newThisMonth ? ` · ${tr(lang, 'sa.newTag')}` : ''}
                    {r.socialWorker && !sw ? ` · ${r.socialWorker}` : ''}
                  </option>
                ))}
              </select>
            </>
          )}
          <button type="button" className="btn small" onClick={() => fileRef.current?.click()}>
            {tr(lang, 'sa.add')}
          </button>
          <input ref={fileRef} type="file" multiple accept=".pdf,.txt" className="sr" tabIndex={-1} aria-hidden="true" onChange={(e) => e.target.files && sa.addFiles(Array.from(e.target.files))} />
        </div>
      </div>

      {sa.error && <div className="note" role="alert">{tr(lang, 'misc.error', { e: sa.error })}</div>}
      {!aiOnline && <div className="note info">{tr(lang, 'sa.offline')}</div>}

      {!cur ? (
        <div className="empty">{tr(lang, 'sa.none')}</div>
      ) : (
        <div className="split">
          <div style={{ flex: '1 1 460px', minWidth: 0, background: '#EDECE8', padding: 24, borderRight: '1px solid var(--border)' }}>
            {cur.text ? <ReportView text={cur.text} evidence={evidence} zemis={p?.zemis} selected={field && p ? p.fields[field].evidence : undefined} /> : <span className="muted">{tr(lang, 'sa.loadingText')}</span>}
          </div>
          <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span className="panel-title">{tr(lang, 'sa.fields')}</span>
                <button type="button" className="btn small primary" disabled={!aiOnline || !cur.text || !!sa.busy} onClick={() => sa.runLive(cur.file)}>
                  {tr(lang, ex ? 'sa.rerun' : 'sa.run')}
                </button>
              </div>
              {live ? (
                <span className="tag ai" role="status">
                  {tr(lang, 'sa.running', { n: sa.livePersons.length, total: nPersons })}
                </span>
              ) : ex ? (
                <span className="tag ai">{ex.cached ? tr(lang, 'sa.cached', { model: ex.model, date: fdate(ex.at) }) : tr(lang, 'sa.live', { model: ex.model })}</span>
              ) : (
                <span className="muted" style={{ fontSize: 13 }}>
                  {tr(lang, 'sa.noResult')}
                </span>
              )}
              {persons.length > 0 && (
                <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {persons.map((q, k) => (
                    <button key={q.zemis} role="tab" aria-selected={k === personIdx} type="button" className={`btn small${k === personIdx ? ' primary' : ''}`} onClick={() => setPersonIdx(k)}>
                      {q.name}
                    </button>
                  ))}
                </div>
              )}
              {p && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, color: 'var(--ink-2)', flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 120, height: 4, borderRadius: 999, background: 'var(--divider)', overflow: 'hidden' }}>
                    <div style={{ width: `${(decided / SA_FIELDS.length) * 100}%`, height: '100%', background: '#1A7F45' }} />
                  </div>
                  <span className="num">{tr(lang, 'sa.progress', { n: decided, total: SA_FIELDS.length })}</span>
                  <button
                    type="button"
                    className="btn small"
                    onClick={() => SA_FIELDS.forEach((f) => p.fields[f.id].status === 'stated' && !sa.confirmed[p.zemis]?.[f.id] && sa.setField(p.zemis, f.id, p.fields[f.id], cur.file, 'confirmed'))}
                  >
                    {tr(lang, 'sa.confirmAll')}
                  </button>
                  {client && (
                    <button
                      type="button"
                      className="btn small link"
                      onClick={() => {
                        app.setSelected(client.id);
                        app.setScreen('clients');
                      }}
                    >
                      {tr(lang, 'sa.openClient')} ({client.klientNr})
                    </button>
                  )}
                </div>
              )}
            </div>
            {p && SA_FIELDS.map((f) => <FieldRow key={f.id} app={app} p={p} f={f} e={p.fields[f.id]} file={cur.file} sel={field === f.id} onPick={() => setField(field === f.id ? undefined : f.id)} />)}
            {p?.modelInput && (
              <details style={{ padding: '10px 18px', borderBottom: '1px solid var(--divider)', fontSize: 12.5 }}>
                <summary style={{ cursor: 'pointer', fontWeight: 500 }}>{tr(lang, 'sa.modelSaw')}</summary>
                <ol className="mono" style={{ margin: '8px 0 0', paddingLeft: 22, fontSize: 11.5, color: 'var(--ink-2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {p.modelInput.map((x, k) => (
                    <li key={k}>{x}</li>
                  ))}
                </ol>
              </details>
            )}
            <div className="muted" style={{ padding: '10px 18px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="tag ai" style={{ whiteSpace: 'normal' }}>{tr(lang, 'sa.aiTag')}</span>
              <span>{tr(lang, 'sa.private')}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
