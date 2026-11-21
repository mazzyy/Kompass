// Charts for the assistant. The AI never draws or invents numbers: the question decides WHICH chart,
// the numbers come from the rules engine's RunResult. Each chart also has a short text summary (no client
// names) that the local model may quote with [K].
import { addMonths } from '../engine/dates';
import type { GoalId, Person, RunResult, Status } from '../engine/model';
import { hasUi, pct, statusLabel, tr, type UiKey } from './strings';
import type { App } from './useApp';

export type ChartKind = 'overview' | 'status' | 'by_sw' | 'by_year' | 'reasons' | 'deadlines' | 'forecast' | 'claimable';
export interface ChartSpec {
  kind: ChartKind;
  goal?: GoalId;
}

type SegKey = 'reached' | 'on_track' | 'at_risk' | 'missed' | 'not_applicable' | 'g1' | 'g2' | 'g3' | 'count';
interface Seg {
  key: SegKey;
  value: number;
}
interface Bar {
  label: string;
  segs: Seg[];
  note?: string;
}
export interface ChartData {
  spec: ChartSpec;
  title: string;
  subtitle: string;
  bars: Bar[];
  legend: SegKey[];
  summary: string; // for the model, no client names
}

export const SEG_COLOR: Record<SegKey, string> = {
  reached: '#1A7F45',
  on_track: '#F2C200',
  at_risk: '#D12C1F',
  missed: '#7A1712',
  not_applicable: '#C7C7C7',
  g1: '#285F8F',
  g2: '#6D9BC3',
  g3: '#A9C6DF',
  count: '#285F8F',
};

const goalName = (lang: App['lang'], g: GoalId) => tr(lang, `goal.${g}` as UiKey);
const goalShort = (lang: App['lang'], g: GoalId) => goalName(lang, g).split('·')[0].trim();
const segLabel = (lang: App['lang'], k: SegKey) => (k === 'g1' || k === 'g2' || k === 'g3' ? goalShort(lang, Number(k[1]) as GoalId) : k === 'count' ? tr(lang, 'ch.count') : statusLabel(lang, k as Status));

// ---------- which chart fits the question ----------

const has = (t: string, re: RegExp) => re.test(t);

/** Goal named in the question (number or topic), else undefined. */
export function goalIn(q: string): GoalId | undefined {
  const t = q.toLowerCase();
  const m = t.match(/(?:ziel|goal|level)\s*([123])/);
  if (m) return Number(m[1]) as GoalId;
  if (has(t, /sprach|a1\b|deutsch|language|german/)) return 1;
  // 'arbeit(?!er)' and '\\bwork\\b' so that 'Sozialarbeiter' / 'social worker' do not mean goal 2
  if (has(t, /arbeit(?!er|ende)|\bjob|erwerb|\bstelle|ausbildung|\blehre|\bwork\b|employ|education|training/)) return 2;
  if (has(t, /sozialhilfe|haushalt|unabhängig|social assistance|household|independen|welfare/)) return 3;
  return undefined;
}

/**
 * Charts for a question. prevGoal lets a follow-up ("and by social worker?") stay on the same goal.
 * Returns [] when the question is not about figures.
 */
export function detectCharts(q: string, prevGoal?: GoalId): ChartSpec[] {
  const t = q.toLowerCase();
  const visual = has(t, /visuali|zeig|show|chart|grafik|diagramm|plot|graph|darstell|vergleich|compare|verteil|distribution|übersicht|overview|dashboard|bild|picture/);
  const g = goalIn(t);
  const goal = g ?? prevGoal;
  const out: ChartSpec[] = [];
  const add = (kind: ChartKind, gg: GoalId | undefined = goal) => {
    if (!out.some((x) => x.kind === kind && x.goal === gg)) out.push({ kind, goal: gg });
  };
  if (has(t, /prognose|forecast|quartal|quarter|erwart|expect|zukunft|future/)) add('forecast', undefined);
  if (has(t, /abrechen|claim|bezahl|payment|geld|chf|money|pauschal/)) add('claimable', undefined);
  if (has(t, /fallführ|sozialarbeit|social worker|caseworker|team|mitarbeit|staff|pro person|caseload|fallbelast/)) add('by_sw', goal ?? 1);
  if (has(t, /einreisejahr|jahrgang|kohorte|cohort|entry year|nach jahr|by year|per year|jahr/)) add('by_year', goal === 3 ? 1 : goal ?? 1);
  const people = has(t, /leute|personen|klient|people|clients|wie viele|how many|gefährdet|at risk|verpasst|missed|rückstand|behind|lagging|zurück/);
  if (has(t, /gründe|reasons|rückstand|zurück|lagging|behind|hindernis/) || (has(t, /warum|wieso|why|grund/) && people)) add('reasons', goal ?? 1);
  if (has(t, /frist|deadline|monat|month|bald|soon|nächst|upcoming|termin/)) add('deadlines', goal ?? 1);
  const numeric = has(t, /wie viele|wieviele|anzahl|how many|number of|quote|rate|prozent|percent|stand|status|ampel/);
  if (!out.length && (visual || numeric)) {
    if (goal) {
      add('status');
      if (visual) {
        add('by_sw');
        add('reasons');
      }
    } else add('overview', undefined);
  } else if (out.length && visual && goal && !out.some((x) => x.kind === 'status')) out.unshift({ kind: 'status', goal });
  return out.slice(0, 4);
}

// ---------- data ----------

const STATUS_SEGS: SegKey[] = ['reached', 'on_track', 'at_risk', 'missed'];

/** Units counted for a goal: persons for goals 1/2, households (via the head) for goal 3. */
function units(res: RunResult, persons: Person[], g: GoalId) {
  if (g === 3) {
    const ids = new Set(persons.map((p) => p.id));
    return res.households.filter((h) => h.goal3 && h.members.some((m) => ids.has(m))).map((h) => ({ r: h.goal3!, sw: h.socialWorker, year: undefined as number | undefined }));
  }
  return persons.filter((p) => p.goals[g]).map((p) => ({ r: p.goals[g]!, sw: p.socialWorker, year: p.entryYear }));
}

export function chartData(spec: ChartSpec, app: App, res: RunResult): ChartData | undefined {
  const { lang } = app;
  const sw = app.role.kind === 'sw' ? app.role.name : undefined;
  const persons = app.visible!.persons;
  const de = lang === 'de';
  const g = spec.goal ?? 1;
  const unitWord = g === 3 ? (de ? 'Haushalte' : 'households') : de ? 'Personen' : 'people';
  const statusBar = (label: string, rs: { r: { status: Status } }[]): Bar => ({ label, segs: STATUS_SEGS.map((k) => ({ key: k, value: rs.filter((x) => x.r.status === k).length })) });
  const statusText = (b: Bar) => b.segs.map((s) => `${segLabel(lang, s.key)} ${s.value}`).join(', ');

  switch (spec.kind) {
    case 'overview': {
      const bars = ([1, 2, 3] as GoalId[]).filter((x) => res.totals[x]).map((x) => statusBar(goalName(lang, x), units(res, persons, x)));
      return { spec, title: tr(lang, 'ch.overview'), subtitle: tr(lang, 'ch.counted'), bars, legend: STATUS_SEGS, summary: bars.map((b) => `${b.label}: ${statusText(b)}`).join('. ') };
    }
    case 'status': {
      const u = units(res, persons, g).filter((x) => x.r.status !== 'not_applicable' && x.r.status !== 'no_data');
      const b = statusBar(goalName(lang, g), u);
      const reached = b.segs[0].value;
      const behind = b.segs[2].value + b.segs[3].value;
      return {
        spec,
        title: goalName(lang, g),
        subtitle: `${u.length} ${unitWord} ${de ? 'gezählt' : 'counted'} · ${pct(u.length ? reached / u.length : null)} ${statusLabel(lang, 'reached')}`,
        bars: b.segs.map((s) => ({ label: segLabel(lang, s.key), segs: [s] })),
        legend: STATUS_SEGS,
        summary: `${goalName(lang, g)}: ${u.length} ${unitWord} ${de ? 'gezählt' : 'counted'}; ${statusText(b)}; ${de ? 'im Rückstand (gefährdet + verpasst)' : 'lagging behind (at risk + missed)'} ${behind}; ${de ? 'Quote erreicht' : 'rate reached'} ${pct(u.length ? reached / u.length : null)}.`,
      };
    }
    case 'by_sw': {
      const u = units(res, persons, g);
      const names = sw ? [sw] : res.socialWorkers;
      const bars = names.map((n) => statusBar(n, u.filter((x) => x.sw === n)));
      return {
        spec,
        title: `${goalShort(lang, g)} ${de ? 'nach Fallführung' : 'by social worker'}`,
        subtitle: `${unitWord} · ${tr(lang, 'ch.counted')}`,
        bars,
        legend: STATUS_SEGS,
        // names of social workers stay in the chart; the text for the model only has ranks (spoken answers stay name-free)
        summary: `${goalShort(lang, g)} ${de ? 'nach Fallführung (ohne Namen, sortiert nach Anteil im Rückstand)' : 'by social worker (no names, sorted by share lagging behind)'}: ${bars
          .map((b) => {
            const n = b.segs.reduce((s, x) => s + x.value, 0);
            const lag = b.segs[2].value + b.segs[3].value;
            return { n, lag, reached: b.segs[0].value };
          })
          .sort((a, b) => b.lag / (b.n || 1) - a.lag / (a.n || 1))
          .map((x, i) => `${de ? 'Rang' : 'rank'} ${i + 1}: ${x.n} ${de ? 'gezählt' : 'counted'}, ${x.lag} ${de ? 'im Rückstand' : 'behind'} (${pct(x.n ? x.lag / x.n : null)}), ${pct(x.n ? x.reached / x.n : null)} ${statusLabel(lang, 'reached')}`)
          .join('; ')}.`,
      };
    }
    case 'by_year': {
      const u = units(res, persons, g).filter((x) => x.year !== undefined);
      const years = [...new Set(u.map((x) => x.year!))].sort();
      const bars = years.map((y) => statusBar(String(y), u.filter((x) => x.year === y))).filter((b) => b.segs.some((s) => s.value > 0));
      return {
        spec,
        title: `${goalShort(lang, g)} ${de ? 'nach Einreisejahr' : 'by entry year'}`,
        subtitle: `${unitWord} · ${tr(lang, 'ch.counted')}`,
        bars,
        legend: STATUS_SEGS,
        summary: `${goalShort(lang, g)} ${de ? 'nach Einreisejahr' : 'by entry year'}: ${bars.map((b) => `${b.label}: ${statusText(b)}`).join('; ')}.`,
      };
    }
    case 'reasons': {
      const m = new Map<string, { risk: number; missed: number }>();
      for (const p of persons) {
        const r = p.goals[g];
        if (!r || (r.status !== 'at_risk' && r.status !== 'missed') || (g === 3 && !p.isHead)) continue;
        const e = m.get(r.reason.key) ?? { risk: 0, missed: 0 };
        if (r.status === 'at_risk') e.risk++;
        else e.missed++;
        m.set(r.reason.key, e);
      }
      const bars = [...m.entries()]
        .sort((a, b) => b[1].risk + b[1].missed - (a[1].risk + a[1].missed))
        .map(([k, v]) => ({ label: hasUi(`lag.${k}`) ? tr(lang, `lag.${k}` as UiKey) : k, segs: [{ key: 'at_risk' as SegKey, value: v.risk }, { key: 'missed' as SegKey, value: v.missed }] }));
      return {
        spec,
        title: `${goalShort(lang, g)}: ${de ? 'warum im Rückstand' : 'why behind'}`,
        subtitle: de ? 'Grund aus den Regeln' : 'reason from the rules',
        bars,
        legend: ['at_risk', 'missed'],
        summary: `${goalShort(lang, g)}, ${de ? 'Gründe für Rückstand' : 'reasons for lagging behind'}: ${bars.map((b) => `${b.label} ${b.segs[0].value + b.segs[1].value}`).join('; ') || '-'}.`,
      };
    }
    case 'deadlines': {
      const u = units(res, persons, g).filter((x) => x.r.status === 'on_track' || x.r.status === 'at_risk');
      const bars: Bar[] = Array.from({ length: 12 }, (_, i) => {
        const from = addMonths(res.stichtag, i);
        const to = addMonths(res.stichtag, i + 1);
        const inM = u.filter((x) => x.r.deadline !== undefined && x.r.deadline >= from && x.r.deadline < to);
        const d = new Date(from * 864e5);
        return {
          label: `${String(d.getUTCMonth() + 1).padStart(2, '0')}.${d.getUTCFullYear()}`,
          segs: [
            { key: 'at_risk' as SegKey, value: inM.filter((x) => x.r.status === 'at_risk').length },
            { key: 'on_track' as SegKey, value: inM.filter((x) => x.r.status === 'on_track').length },
          ],
        };
      });
      return {
        spec,
        title: `${goalShort(lang, g)}: ${de ? 'Fristen in den nächsten 12 Monaten' : 'deadlines in the next 12 months'}`,
        subtitle: de ? 'noch nicht erreicht, nach Monat der Frist' : 'not reached yet, by month of the deadline',
        bars,
        legend: ['at_risk', 'on_track'],
        summary: `${goalShort(lang, g)}, ${de ? 'offene Fristen pro Monat' : 'open deadlines per month'}: ${bars.map((b) => `${b.label} ${b.segs[0].value + b.segs[1].value}`).join(', ')}.`,
      };
    }
    case 'forecast': {
      if (sw || !res.forecast.length) return undefined;
      const bars = res.forecast.map((q) => ({ label: q.label, segs: [{ key: 'g1' as SegKey, value: q.goal1 }, { key: 'g2' as SegKey, value: q.goal2 }, { key: 'g3' as SegKey, value: q.goal3 }] }));
      return {
        spec,
        title: tr(lang, 'fc.title'),
        subtitle: de ? 'erwartete rechtzeitige Zielerreichungen pro Quartal' : 'goals expected on time per quarter',
        bars,
        legend: ['g1', 'g2', 'g3'],
        summary: `${tr(lang, 'fc.title')}: ${bars.map((b) => `${b.label}: ${b.segs.map((s) => `${segLabel(lang, s.key)} ${s.value}`).join(', ')}`).join('; ')}.`,
      };
    }
    case 'claimable': {
      const ids = new Set(persons.map((p) => p.id));
      const cl = res.claimable.filter((c) => ids.has(c.personId));
      const bars = ([1, 2, 3] as GoalId[]).map((x) => ({ label: goalName(lang, x), segs: [{ key: 'count' as SegKey, value: cl.filter((c) => c.goal === x).length }] }));
      return {
        spec,
        title: tr(lang, 'hd.claim'),
        subtitle: tr(lang, 'hd.claim.sub'),
        bars,
        legend: ['count'],
        summary: `${tr(lang, 'hd.claim')}: ${cl.length} (${bars.map((b) => `${goalShort(lang, (bars.indexOf(b) + 1) as GoalId)} ${b.segs[0].value}`).join(', ')}).`,
      };
    }
  }
}

// ---------- view ----------

export function ChartView({ data, lang, compact }: { data: ChartData; lang: App['lang']; compact?: boolean }) {
  const totals = data.bars.map((b) => b.segs.reduce((s, x) => s + x.value, 0));
  const max = Math.max(1, ...totals);
  const shown = data.legend.filter((k) => data.bars.some((b) => b.segs.some((s) => s.key === k && s.value > 0)));
  return (
    <figure className={`chart${compact ? ' compact' : ''}`} aria-label={data.title}>
      <figcaption>
        <span className="chart-title">{data.title}</span>
        <span className="chart-sub">{data.subtitle}</span>
      </figcaption>
      <div className="chart-bars" role="table">
        {data.bars.map((b, i) => (
          <div key={b.label} className="chart-row" role="row" title={b.segs.map((s) => `${segLabel(lang, s.key)}: ${s.value}`).join(' · ')}>
            <span className="chart-label" role="rowheader">
              {b.label}
            </span>
            <span className="chart-track" role="cell">
              {b.segs.map((s) =>
                s.value > 0 ? <span key={s.key} className="chart-seg" style={{ width: `${(s.value / max) * 100}%`, background: SEG_COLOR[s.key] }} /> : null,
              )}
            </span>
            <span className="chart-value" role="cell">
              {totals[i]}
            </span>
          </div>
        ))}
      </div>
      {shown.length > 1 && (
        <div className="chart-legend">
          {shown.map((k) => (
            <span key={k}>
              <i style={{ background: SEG_COLOR[k] }} />
              {segLabel(lang, k)}
            </span>
          ))}
        </div>
      )}
    </figure>
  );
}
