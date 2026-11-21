import { useMemo } from 'react';
import { fmt } from '../../engine/dates';
import { computePatterns, type FactorResult } from '../../engine/patterns';
import { pct, tr, type UiKey } from '../strings';
import type { App } from '../useApp';
import { EmptyRun } from './common';

const gl = (lang: App['lang'], label: string) => {
  const k = `g.${label}` as UiKey;
  const t = tr(lang, k);
  return t === k || !t ? label : t;
};

function Row({ app, f, overall, cohort }: { app: App; f: FactorResult; overall: number; cohort: number }) {
  const { lang } = app;
  const srcKey = f.source === 'ai' ? 'pat.src.ai' : f.source === 'equity' ? 'pat.src.equity' : 'pat.src.table';
  return (
    <div style={{ display: 'flex', gap: 16, padding: '14px 20px', borderBottom: '1px solid var(--divider)' }}>
      <div style={{ width: 260, flex: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span style={{ fontWeight: 500, lineHeight: 1.35, color: f.hidden ? 'var(--muted)' : 'var(--ink)' }}>{tr(lang, `f.${f.id}` as UiKey)}</span>
        <span className={`tag${f.source === 'ai' ? ' ai' : ''}`} style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>
          {tr(lang, srcKey)}
        </span>
        {f.leftOut > 0 && f.leftOut < cohort && <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'pat.leftOut', { n: f.leftOut })}</span>}
        {!f.hidden && f.hiddenGroups > 0 && <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'pat.hiddenGroups', { n: f.hiddenGroups, min: app.rules.patterns.min_group_size })}</span>}
      </div>
      {f.hidden ? (
        <span className="muted" style={{ fontSize: 13, alignSelf: 'center' }}>
          {f.leftOut >= cohort ? tr(lang, f.source === 'ai' ? 'pat.noConfirmed' : 'pat.noData') : tr(lang, 'pat.hidden', { min: app.rules.patterns.min_group_size })}
        </span>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
          {f.groups.map((g, i) => (
            <div key={g.label} style={{ display: 'flex', alignItems: 'center', gap: 16, height: 22 }}>
              <span style={{ width: 64, flex: 'none', fontSize: 12, color: 'var(--ink-2)' }}>{gl(lang, g.label)}</span>
              <div title={tr(lang, 'pat.range', { lo: Math.round(g.ci[0] * 100), hi: Math.round(g.ci[1] * 100) })} style={{ flex: 1, position: 'relative', height: 22 }} role="img" aria-label={`${gl(lang, g.label)}: ${pct(g.rate)}, ${tr(lang, 'pat.range', { lo: Math.round(g.ci[0] * 100), hi: Math.round(g.ci[1] * 100) })}`}>
                {[25, 50, 75].map((x) => (
                  <div key={x} style={{ position: 'absolute', left: `${x}%`, top: 0, bottom: 0, borderLeft: '1px solid var(--divider-2)' }} />
                ))}
                <div style={{ position: 'absolute', left: `${overall * 100}%`, top: 0, bottom: 0, borderLeft: '1px dashed var(--faint)' }} />
                <div style={{ position: 'absolute', left: `${g.ci[0] * 100}%`, width: `${(g.ci[1] - g.ci[0]) * 100}%`, top: 10, height: 2, background: '#3F3F46' }} />
                <div style={{ position: 'absolute', left: `calc(${g.rate * 100}% - 6px)`, top: 5, width: 12, height: 12, borderRadius: 999, boxSizing: 'border-box', background: i === 0 ? '#121212' : '#fff', border: '2px solid #121212' }} />
              </div>
              <span className="num" style={{ width: 110, flex: 'none', textAlign: 'right', fontSize: 13 }}>
                <span style={{ fontWeight: 600 }}>{pct(g.rate)}</span>
                <span className="muted"> · {g.n}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function PatternsScreen({ app }: { app: App }) {
  const { lang, result: res } = app;
  const confirmed = useMemo(() => {
    const out: Record<string, Record<string, unknown>> = {};
    for (const [z, fields] of Object.entries(app.sa.confirmed)) for (const [f, c] of Object.entries(fields)) if (c.status === 'confirmed') (out[z] ??= {})[f] = c.value;
    return out;
  }, [app.sa.confirmed]);
  const pr = useMemo(
    () => (res ? computePatterns(res.persons, new Map(Object.entries(res.features)), res.stichtag, app.rules.patterns.min_group_size, confirmed) : undefined),
    [res, confirmed, app.rules.patterns.min_group_size],
  );
  if (!res || !pr) return <EmptyRun app={app} />;
  // Headline: the actionable factor with the largest gap (never nationality).
  const top = pr.factors.filter((f) => f.kind === 'actionable' && !f.hidden && f.gap !== null).sort((a, b) => b.gap! - a.gap!)[0];
  const best = top ? [...top.groups].sort((a, b) => b.rate - a.rate) : [];
  const sections: [string, FactorResult[]][] = [
    ['pat.section.actionable', pr.factors.filter((f) => f.kind === 'actionable')],
    ['pat.section.equity', pr.factors.filter((f) => f.kind === 'equity' || f.id === 'latin')],
    ['pat.section.background', pr.factors.filter((f) => f.kind === 'background')],
  ];
  return (
    <>
      <div>
        <h1>{tr(lang, 'pat.title')}</h1>
        <p className="sub">{tr(lang, 'pat.sub', { n: pr.cohortSize, date: fmt(res.stichtag), pct: pct(pr.rate) })}</p>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <div className="panel" style={{ flex: '2 1 380px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span className="sec-title">{tr(lang, 'pat.strongest')}</span>
          <span style={{ fontSize: 17, fontWeight: 600, lineHeight: 1.4 }}>
            {top
              ? tr(lang, 'pat.strong.text', {
                  factor: tr(lang, `f.${top.id}` as UiKey),
                  a: gl(lang, best[best.length - 1].label),
                  ra: pct(best[best.length - 1].rate),
                  b: gl(lang, best[0].label),
                  rb: pct(best[0].rate),
                })
              : tr(lang, 'pat.none')}
          </span>
        </div>
        <div className="panel" style={{ flex: '1 1 280px', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: 'var(--ink-2)' }}>
          <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{tr(lang, 'pat.howto.title')}</span>
          <span>{tr(lang, 'pat.howto', { min: pr.minGroup })}</span>
        </div>
      </div>
      {sections.map(([title, list]) => (
        <section key={title} className="panel scroll-x" aria-label={tr(lang, title as UiKey)}>
          <div style={{ minWidth: 680 }}>
            <div className="panel-head">
              <span className="panel-title">{tr(lang, title as UiKey)}</span>
            </div>
            {list.map((f) => (
              <Row key={`${title}-${f.id}`} app={app} f={f} overall={pr.rate} cohort={pr.cohortSize} />
            ))}
          </div>
        </section>
      ))}
      <span className="muted" style={{ fontSize: 12 }}>
        {tr(lang, 'pat.synthetic')}
      </span>
    </>
  );
}
