import { useMemo } from 'react';
import { fmt } from '../../engine/dates';
import { computePatterns, type FactorResult, type GroupStat } from '../../engine/patterns';
import { pct, tr, type UiKey } from '../strings';
import type { App } from '../useApp';
import { EmptyRun } from './common';

const gl = (lang: App['lang'], label: string) => {
  const k = `g.${label}` as UiKey;
  const t = tr(lang, k);
  return t === k || !t ? label : t;
};

const KIND_COLOR: Record<string, string> = { actionable: '#285F8F', equity: '#7A5AA6', background: '#9A9A9A' };
const pp = (x: number) => `${x > 0 ? '+' : x < 0 ? '−' : '±'}${Math.abs(Math.round(x * 100))}`;

/** 100 squares; `filled` of them coloured. Groups only: it shows a rate, never people. */
function Waffle({ filled, color, label }: { filled: number; color: string; label: string }) {
  return (
    <div className="waffle" role="img" aria-label={label}>
      {Array.from({ length: 100 }, (_, i) => {
        // fills from the bottom up, like a glass
        const on = i >= 100 - filled;
        return <span key={i} className={on ? 'on' : ''} style={on ? { background: color, animationDelay: `${(99 - i) * 9}ms` } : undefined} />;
      })}
    </div>
  );
}

/** Ring for a rate (0..1). */
export function Ring({ value, size = 132, color = 'var(--reached)', font = 26 }: { value: number; size?: number; color?: string; font?: number }) {
  const r = size / 2 - (size > 80 ? 10 : 6);
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={pct(value)} style={{ flex: 'none' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--divider)" strokeWidth={size > 80 ? 12 : 8} />
      <circle
        className="ring-arc"
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={size > 80 ? 12 : 8}
        strokeLinecap="round"
        strokeDasharray={`${c * value} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" style={{ fontSize: font, fontWeight: 700, fill: 'var(--ink)' }}>
        {pct(value)}
      </text>
    </svg>
  );
}

/** One group: likely range as a band, the rate as a dot (green above the average, red below). */
function GroupBar({ lang, g, overall }: { lang: App['lang']; g: GroupStat; overall: number }) {
  const above = g.rate >= overall;
  const range = tr(lang, 'pat.range', { lo: Math.round(g.ci[0] * 100), hi: Math.round(g.ci[1] * 100) });
  return (
    <div className="pg-row" title={`${gl(lang, g.label)}: ${pct(g.rate)} (${g.reached}/${g.n}) · ${range}`}>
      <span className="pg-label">{gl(lang, g.label)}</span>
      <div className="pg-track" role="img" aria-label={`${gl(lang, g.label)}: ${pct(g.rate)}, ${range}`}>
        {[25, 50, 75].map((x) => (
          <span key={x} className="pg-grid" style={{ left: `${x}%` }} />
        ))}
        <span className="pg-avg" style={{ left: `${overall * 100}%` }} />
        <span className="pg-band" style={{ left: `${g.ci[0] * 100}%`, width: `${(g.ci[1] - g.ci[0]) * 100}%`, background: above ? 'rgba(26,127,69,.16)' : 'rgba(209,44,31,.14)' }} />
        <span className="pg-dot" style={{ left: `${g.rate * 100}%`, background: above ? 'var(--reached)' : 'var(--risk)' }} />
      </div>
      <span className="pg-val num">
        <strong>{pct(g.rate)}</strong> <span className="muted">· {g.n}</span>
      </span>
      <span className={`pg-delta ${above ? 'up' : 'down'}`}>{pp(g.rate - overall)} pp</span>
    </div>
  );
}

function Axis({ lang, overall }: { lang: App['lang']; overall: number }) {
  return (
    <div className="pg-row pg-axis" aria-hidden="true">
      <span className="pg-label" />
      <div className="pg-track axis">
        {[0, 25, 50, 75, 100].map((x) => (
          <span key={x} className="pg-tick" style={{ left: `${x}%` }}>
            {x} %
          </span>
        ))}
        <span className="pg-avg-label" style={{ left: `${overall * 100}%` }}>
          {tr(lang, 'pat.avg', { pct: pct(overall) })}
        </span>
      </div>
      <span className="pg-val" />
      <span className="pg-delta" />
    </div>
  );
}

function Factor({ app, f, overall, cohort }: { app: App; f: FactorResult; overall: number; cohort: number }) {
  const { lang } = app;
  const srcKey = f.source === 'ai' ? 'pat.src.ai' : f.source === 'equity' ? 'pat.src.equity' : 'pat.src.table';
  return (
    <div id={`factor-${f.id}`} className="pf">
      <div className="pf-head">
        <span className="pf-name" style={{ color: f.hidden ? 'var(--muted)' : 'var(--ink)' }}>
          <i style={{ background: KIND_COLOR[f.kind] }} />
          {tr(lang, `f.${f.id}` as UiKey)}
        </span>
        <span className={`tag${f.source === 'ai' ? ' ai' : ''}`} style={{ whiteSpace: 'normal' }}>
          {tr(lang, srcKey)}
        </span>
        {!f.hidden && f.gap !== null && <span className="tag">{tr(lang, 'pat.gap.chip', { n: f.gap })}</span>}
        {f.leftOut > 0 && f.leftOut < cohort && <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'pat.leftOut', { n: f.leftOut })}</span>}
        {!f.hidden && f.hiddenGroups > 0 && <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'pat.hiddenGroups', { n: f.hiddenGroups, min: app.rules.patterns.min_group_size })}</span>}
      </div>
      {f.hidden ? (
        <span className="muted" style={{ fontSize: 13 }}>
          {f.leftOut >= cohort ? tr(lang, f.source === 'ai' ? 'pat.noConfirmed' : 'pat.noData') : tr(lang, 'pat.hidden', { min: app.rules.patterns.min_group_size })}
        </span>
      ) : (
        <div className="pf-groups">
          {f.groups.map((g) => (
            <GroupBar key={g.label} lang={lang} g={g} overall={overall} />
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
  const hi = best[0];
  const lo = best[best.length - 1];
  // What makes the biggest difference: visible factors by gap; nationality is never ranked (shown last, below).
  const ranked = pr.factors.filter((f) => !f.hidden && f.gap !== null && f.id !== 'nationality').sort((a, b) => b.gap! - a.gap!);
  const maxGap = Math.max(1, ...ranked.map((f) => f.gap!)); // gap is already in percentage points
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

      <div className="pat-hero">
        <section className="panel pat-headline" aria-label={tr(lang, 'pat.strongest')}>
          <span className="sec-title">{tr(lang, 'pat.strongest')}</span>
          {top && hi && lo ? (
            <>
              <span className="pat-headline-text">{tr(lang, `f.${top.id}` as UiKey)}</span>
              <div className="pat-waffles">
                {[hi, lo].map((g, i) => (
                  <div key={g.label} className="pat-waffle-col">
                    <Waffle filled={Math.round(g.rate * 100)} color={i === 0 ? 'var(--reached)' : 'var(--risk)'} label={`${gl(lang, g.label)}: ${pct(g.rate)}`} />
                    <span className="pat-big" style={{ color: i === 0 ? 'var(--reached-text)' : 'var(--risk)' }}>
                      {pct(g.rate)}
                    </span>
                    <span className="pat-cap">
                      <strong>{gl(lang, g.label)}</strong> · {tr(lang, 'pat.waffle.of', { r: Math.round(g.rate * 100) })}
                    </span>
                    <span className="muted" style={{ fontSize: 12 }}>
                      {tr(lang, 'pat.range', { lo: Math.round(g.ci[0] * 100), hi: Math.round(g.ci[1] * 100) })} · n = {g.n}
                    </span>
                  </div>
                ))}
              </div>
              <span className="pat-gap-line">{tr(lang, 'pat.gap.line', { n: Math.round((hi.rate - lo.rate) * 100) })}</span>
            </>
          ) : (
            <span>{tr(lang, 'pat.none')}</span>
          )}
        </section>

        <div className="pat-side">
          <section className="panel pat-ring" aria-label={tr(lang, 'pat.overall')}>
            <Ring value={pr.rate} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="sec-title">{tr(lang, 'pat.overall')}</span>
              <span style={{ fontSize: 14 }}>{tr(lang, 'pat.overall.sub', { r: pr.reached, n: pr.cohortSize })}</span>
              <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'pat.howto', { min: pr.minGroup })}</span>
            </div>
          </section>

          <section className="panel pat-rank" aria-label={tr(lang, 'pat.gap.title')}>
            <div className="panel-head" style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
              <span className="panel-title">{tr(lang, 'pat.gap.title')}</span>
              <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'pat.gap.sub')}</span>
            </div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {ranked.map((f) => (
                <a key={f.id} className="rank-row" href={`#factor-${f.id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`factor-${f.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}>
                  <span className="rank-label">{tr(lang, `f.${f.id}` as UiKey)}</span>
                  <span className="rank-track">
                    <span style={{ width: `${(f.gap! / maxGap) * 100}%`, background: KIND_COLOR[f.kind] }} />
                  </span>
                  <span className="rank-val num">{f.gap} pp</span>
                </a>
              ))}
              <div className="chart-legend" style={{ marginTop: 4 }}>
                {(['actionable', 'equity', 'background'] as const).map((k) => (
                  <span key={k}>
                    <i style={{ background: KIND_COLOR[k] }} />
                    {tr(lang, `pat.section.${k}` as UiKey).replace(/\s*\(.*\)/, '')}
                  </span>
                ))}
              </div>
            </div>
          </section>
        </div>
      </div>

      {sections.map(([title, list]) => (
        <section key={title} className="panel scroll-x" aria-label={tr(lang, title as UiKey)}>
          <div style={{ minWidth: 640 }}>
            <div className="panel-head">
              <span className="panel-title">{tr(lang, title as UiKey)}</span>
              <span className="pg-legend">
                <span>
                  <i className="dot" style={{ background: 'var(--reached)' }} /> {tr(lang, 'pat.above')}
                </span>
                <span>
                  <i className="dot" style={{ background: 'var(--risk)' }} /> {tr(lang, 'pat.below')}
                </span>
                <span>
                  <i className="band" /> {tr(lang, 'pat.band')}
                </span>
              </span>
            </div>
            <div style={{ padding: '4px 20px 6px' }}>
              <Axis lang={lang} overall={pr.rate} />
            </div>
            {list.map((f) => (
              <Factor key={`${title}-${f.id}`} app={app} f={f} overall={pr.rate} cohort={pr.cohortSize} />
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
