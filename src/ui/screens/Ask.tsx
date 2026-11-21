import { useEffect, useRef, useState } from 'react';
import { fmt } from '../../engine/dates';
import type { GoalId, Person, RunResult, Status } from '../../engine/model';
import { buildMessages, embedQuery, INDEX_INFO, retrieve, streamAnswer, type Passage } from '../../rag/ask';
import { hasUi, pct, statusLabel, tr, type UiKey } from '../strings';
import type { App } from '../useApp';
import { useVoice } from '../useVoice';

interface QA {
  id: string;
  q: string;
  lang: 'de' | 'en';
  a: string;
  passages: Passage[];
  state: 'search' | 'write' | 'done' | 'offline' | 'error' | 'person';
  err?: string;
  people?: { id: string; name: string; sw: string }[];
}

// Kept for the session so answers survive switching screens (never stored on disk).
let HISTORY: QA[] = [];

const EXAMPLES: Record<'de' | 'en', string[]> = {
  de: [
    'Warum zählt ein Praktikum nicht für Ziel 2?',
    'Ab wann gilt die 2027-Regel und für wen?',
    'Was zählt als A1-Nachweis?',
    'Wie viele sind bei Ziel 1 im Rückstand, und warum?',
    'Wie schützt das Cockpit die Daten?',
  ],
  en: [
    "Why doesn't an internship count for goal 2?",
    'When does the 2027 rule apply, and to whom?',
    'What counts as A1 proof?',
    'How many are behind on goal 1, and why?',
    'How does the cockpit protect the data?',
  ],
};

/** This month's figures for the model, without client names (social worker names only in management view). */
function totalsText(app: App, res: RunResult): string {
  const { lang } = app;
  const sw = app.role.kind === 'sw' ? app.role.name : undefined;
  const persons = app.visible!.persons;
  const ids = new Set(persons.map((p) => p.id));
  const lines: string[] = [];
  lines.push(`${lang === 'de' ? 'Stichtag' : 'Reporting date'} ${fmt(res.stichtag)}; ${lang === 'de' ? 'aktuelle Klient:innen' : 'current clients'}: ${persons.length}${sw ? ` (${sw})` : ''}.`);
  for (const g of [1, 2, 3] as GoalId[]) {
    const t = res.totals[g];
    if (!t) continue;
    const r = sw ? t.bySocialWorker.find((x) => x.group === sw) : t.overall;
    if (!r) continue;
    const unit = t.unit === 'households' ? (lang === 'de' ? 'Haushalte' : 'households') : lang === 'de' ? 'Personen' : 'people';
    const s = (k: Status) => statusLabel(lang, k);
    lines.push(
      `${tr(lang, `goal.${g}` as UiKey)}: ${r.counted} ${unit} ${lang === 'de' ? 'gezählt' : 'counted'}; ${s('reached')} ${r.reached} (${pct(r.rate)}), ${s('on_track')} ${r.counts.on_track}, ${s('at_risk')} ${r.counts.at_risk}, ${s('missed')} ${r.counts.missed}, ${lang === 'de' ? 'im Rückstand (gefährdet + verpasst)' : 'lagging behind (at risk + missed)'} ${r.counts.at_risk + r.counts.missed}, ${s('not_applicable')} ${r.counts.not_applicable}.`,
    );
    // reasons for lagging behind (from the rules)
    const reasons = new Map<string, number>();
    for (const p of persons) {
      const x = p.goals[g];
      if (!x || (x.status !== 'at_risk' && x.status !== 'missed') || (g === 3 && !p.isHead)) continue;
      reasons.set(x.reason.key, (reasons.get(x.reason.key) ?? 0) + 1);
    }
    if (reasons.size)
      lines.push(
        `  ${lang === 'de' ? 'Gründe für Rückstand' : 'Reasons for lagging behind'}: ${[...reasons.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([k, n]) => `${hasUi(`lag.${k}`) ? tr(lang, `lag.${k}` as UiKey) : k} ${n}`)
          .join('; ')}.`,
      );
    if (!sw)
      lines.push(
        `  ${lang === 'de' ? 'Nach Fallführung' : 'By social worker'}: ${t.bySocialWorker.map((x) => `${x.group}: ${s('at_risk')} ${x.counts.at_risk}, ${s('missed')} ${x.counts.missed}, ${pct(x.rate)} ${s('reached')}`).join('; ')}.`,
      );
  }
  const cl = res.claimable.filter((c) => ids.has(c.personId));
  lines.push(`${tr(lang, 'hd.claim')}: ${cl.length} (${[1, 2, 3].map((g) => `${tr(lang, `goal.${g}` as UiKey).split('·')[0].trim()} ${cl.filter((c) => c.goal === g).length}`).join(', ')}).`);
  const sws = sw ? [sw] : res.socialWorkers;
  lines.push(`${tr(lang, 'nav.calls')}: ${sws.map((n) => `${n} ${res.callLists[n]?.length ?? 0}`).join('; ')}.`);
  const dq = new Map<string, number>();
  for (const a of res.alerts) if (!a.personId || ids.has(a.personId)) dq.set(a.code, (dq.get(a.code) ?? 0) + 1);
  lines.push(`${tr(lang, 'nav.quality')}: ${[...dq.entries()].map(([c, n]) => `${hasUi(`dq.code.${c}`) ? tr(lang, `dq.code.${c}` as UiKey) : c} ${n}`).join('; ')}.`);
  if (!sw && res.forecast.length) lines.push(`${tr(lang, 'fc.title')}: ${res.forecast.map((q) => `${q.label} ${q.goal1 + q.goal2 + q.goal3}`).join(', ')}.`);
  return lines.join('\n');
}

/** Clients named in a question (first name of the shown name, or client / Zemis number). */
function matchPeople(text: string, persons: Person[]): { id: string; name: string; sw: string }[] {
  const t = text.toLowerCase();
  const nums = new Set(text.match(/\b\d{5,9}\b/g) ?? []);
  const out: { id: string; name: string; sw: string }[] = [];
  for (const p of persons) {
    const first = p.displayName.startsWith('K-') ? '' : p.displayName.split(/\s+/)[0].toLowerCase();
    const byName = first.length > 2 && new RegExp(`(^|[^a-zäöüéè])${first}([^a-zäöüéè]|$)`).test(t);
    if (byName || nums.has(p.klientNr) || nums.has(p.zemis)) out.push({ id: p.id, name: p.displayName, sw: p.socialWorker });
    if (out.length >= 6) break;
  }
  return out;
}

export function AskScreen({ app }: { app: App }) {
  const { lang, result: res } = app;
  const [q, setQ] = useState('');
  const [list, setList] = useState<QA[]>(HISTORY);
  const [openSrc, setOpenSrc] = useState<Record<string, boolean>>({});
  const voice = useVoice(app.rules);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);

  const update = (id: string, patch: Partial<QA>) => {
    HISTORY = HISTORY.map((x) => (x.id === id ? { ...x, ...patch } : x));
    setList(HISTORY);
  };

  // Names that must never be read by the cloud voice: clients (first and last names) and social workers.
  const blockNames = (() => {
    const out = new Set<string>();
    for (const p of res?.persons ?? []) if (!p.displayName.startsWith('K-')) out.add(p.displayName.split(/\s+/)[0]);
    for (const r of Object.values(app.sa.extr)) for (const x of r.persons) for (const w of x.name.split(/\s+/)) if (w.length > 2) out.add(w);
    for (const s of res?.socialWorkers ?? []) for (const w of s.split(/[\s.]+/)) if (w.length > 2) out.add(w);
    return [...out];
  })();

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text) return;
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    const id = String(Date.now());
    // Questions about one person go to that person's page (rules, sources), never to the AI model.
    const people = res ? matchPeople(text, app.visible!.persons) : [];
    if (people.length) {
      HISTORY = [{ id, q: text, lang, a: '', passages: [], state: 'person', people }, ...HISTORY];
      setList(HISTORY);
      setQ('');
      return;
    }
    HISTORY = [{ id, q: text, lang, a: '', passages: [], state: 'search' }, ...HISTORY];
    setList(HISTORY);
    setQ('');
    const ai = app.rules.ai;
    let qv: number[] | undefined;
    try {
      qv = await embedQuery(text, ai.endpoint, ai.embed_model ?? 'nomic-embed-text');
    } catch {
      qv = undefined;
    }
    const passages = retrieve(text, qv, 5);
    if (!qv) return update(id, { passages, state: 'offline' });
    update(id, { passages, state: 'write' });
    try {
      const totals = res ? totalsText(app, res) : '';
      const a = await streamAnswer(ai.endpoint, ai.model, buildMessages(lang, text, passages, totals), (t) => update(id, { a: t }), ctl.signal);
      update(id, { a, state: 'done' });
    } catch (e) {
      if ((e as Error).name !== 'AbortError') update(id, { state: 'error', err: String(e) });
    }
  };

  const renderAnswer = (x: QA) => {
    const parts = x.a.split(/(\[(?:\d+|K)\])/g);
    return parts.map((p, i) => {
      const m = p.match(/^\[(\d+|K)\]$/);
      if (!m) return <span key={i}>{p}</span>;
      const n = m[1];
      const title = n === 'K' ? tr(lang, 'ask.k') : x.passages[Number(n) - 1] ? `${x.passages[Number(n) - 1].source} · ${x.passages[Number(n) - 1].title}` : '';
      return (
        <sup key={i} className="cite" title={title}>
          {n}
        </sup>
      );
    });
  };

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr(lang, 'ask.title')}</h1>
          <p className="sub">{tr(lang, 'ask.sub', { n: INDEX_INFO.size })}</p>
        </div>
      </div>

      <section className="panel" aria-label={tr(lang, 'ask.title')}>
        <form
          className="panel-body"
          style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
          onSubmit={(e) => {
            e.preventDefault();
            void ask(q);
          }}
        >
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <label htmlFor="ask-q" className="sr">
              {tr(lang, 'ask.placeholder')}
            </label>
            <input id="ask-q" className="input" style={{ flex: '1 1 320px', height: 42, fontSize: 15 }} placeholder={tr(lang, 'ask.placeholder')} value={q} onChange={(e) => setQ(e.target.value)} />
            <button type="submit" className="btn primary" style={{ height: 42 }} disabled={!q.trim()}>
              {tr(lang, 'ask.button')}
            </button>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {EXAMPLES[lang].map((e) => (
              <button key={e} type="button" className="btn small" onClick={() => void ask(e)}>
                {e}
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 12, borderTop: '1px solid var(--divider)', paddingTop: 10 }}>
            <span className="muted">{tr(lang, 'ask.voice')}</span>
            <div className="lang-toggle" role="group" aria-label={tr(lang, 'ask.voice')}>
              <button type="button" aria-pressed={voice.mode === 'local'} onClick={() => voice.setMode('local')}>
                {tr(lang, 'ask.voice.local')}
              </button>
              <button type="button" aria-pressed={voice.mode === 'elevenlabs'} onClick={() => voice.setMode('elevenlabs')} disabled={voice.cloud === false} title={voice.cloud === false ? tr(lang, 'ask.voice.noKey') : undefined}>
                ElevenLabs
              </button>
            </div>
            <span className="muted" style={{ flex: '1 1 300px' }}>
              {voice.mode === 'elevenlabs' ? tr(lang, 'ask.voice.cloudNote') : tr(lang, 'ask.voice.localNote')}
            </span>
          </div>
        </form>
      </section>

      {voice.note && (
        <div className="note" role="status">
          {tr(lang, `ask.note.${voice.note}` as UiKey)}
        </div>
      )}

      {list.map((x) => (
        <section key={x.id} className="panel" aria-label={x.q}>
          <div className="panel-head">
            <span className="panel-title">{x.q}</span>
            {(x.state === 'done' || x.state === 'write') && x.a && (
              <button type="button" className="btn small" onClick={() => (voice.speaking === x.id ? voice.stop() : void voice.speak(x.a, x.lang, x.id, blockNames))}>
                {voice.speaking === x.id ? tr(lang, 'ask.stop') : tr(lang, 'ask.read')}
              </button>
            )}
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {x.state === 'search' && <span className="muted">{tr(lang, 'ask.searching')}</span>}
            {x.state === 'write' && !x.a && <span className="muted">{tr(lang, 'ask.writing')}</span>}
            {x.a && <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6 }}>{renderAnswer(x)}</p>}
            {x.state === 'offline' && <div className="note">{tr(lang, 'ask.offline')}</div>}
            {x.state === 'person' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span>{tr(lang, 'ask.person')}</span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {x.people!.map((p) => (
                    <button key={p.id} type="button" className="btn small" onClick={() => app.openClient(p.id)}>
                      {p.name} · {p.id} · {p.sw} →
                    </button>
                  ))}
                </div>
              </div>
            )}
            {x.state === 'error' && <div className="note">{tr(lang, 'ask.error', { e: x.err ?? '' })}</div>}
            {x.passages.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, borderTop: '1px solid var(--divider)', paddingTop: 8 }}>
                <button type="button" className="btn link" style={{ alignSelf: 'flex-start', fontSize: 13 }} aria-expanded={!!openSrc[x.id] || x.state === 'offline'} onClick={() => setOpenSrc({ ...openSrc, [x.id]: !openSrc[x.id] })}>
                  {tr(lang, 'ask.sources', { n: x.passages.length })}
                </button>
                {(openSrc[x.id] || x.state === 'offline') &&
                  x.passages.map((p, i) => (
                    <div key={p.id} style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2, padding: '6px 0', borderBottom: '1px solid var(--divider-2)' }}>
                      <span style={{ fontWeight: 600 }}>
                        [{i + 1}] {p.source} · <span className="muted">{p.title}</span>
                      </span>
                      <span style={{ color: 'var(--ink-2)', whiteSpace: 'pre-wrap' }}>{p.text.length > 420 ? `${p.text.slice(0, 420)} …` : p.text}</span>
                    </div>
                  ))}
              </div>
            )}
            {x.state !== 'person' && (
              <span className="tag ai" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>
                {tr(lang, 'ask.tag')}
              </span>
            )}
          </div>
        </section>
      ))}
      {!res && <div className="note info">{tr(lang, 'ask.norun')}</div>}
    </>
  );
}
