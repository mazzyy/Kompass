import { useEffect, useMemo, useRef, useState } from 'react';
import { fmt } from '../../engine/dates';
import type { GoalId, Person, RunResult, Status } from '../../engine/model';
import { buildMessages, embedQuery, retrieve, streamAnswer, type Passage } from '../../rag/ask';
import { ChartView, chartData, detectCharts, goalIn, type ChartSpec } from '../charts';
import { Icon } from '../icons';
import { hasUi, pct, statusLabel, tr, type UiKey } from '../strings';
import type { App } from '../useApp';
import { useVoice } from '../useVoice';

interface Turn {
  id: string;
  q: string;
  lang: 'de' | 'en';
  a: string;
  passages: Passage[];
  charts: ChartSpec[];
  state: 'search' | 'write' | 'done' | 'offline' | 'error' | 'person';
  err?: string;
  people?: { id: string; name: string; sw: string }[];
  spoken?: boolean; // asked by voice
}

// Chart types offered in the empty view panel: [label, question that shows it].
const CANVAS_KINDS: Record<'de' | 'en', [string, string][]> = {
  de: [
    ['Ampel je Ziel', 'Gib mir eine Übersicht'],
    ['Nach Fallführung', 'Ziel 1 nach Fallführung'],
    ['Nach Einreisejahr', 'Ziel 1 nach Einreisejahr'],
    ['Gründe für Rückstand', 'Warum sind Leute bei Ziel 1 im Rückstand?'],
    ['Fristen', 'Zeig die Fristen für Ziel 1'],
    ['Prognose', 'Zeig die Prognose'],
    ['Jetzt abrechenbar', 'Was ist jetzt abrechenbar?'],
  ],
  en: [
    ['Traffic light per goal', 'Give me an overview'],
    ['By social worker', 'Goal 1 by social worker'],
    ['By entry year', 'Goal 1 by entry year'],
    ['Reasons for lagging', 'Why are people behind on goal 1?'],
    ['Deadlines', 'Show the deadlines for goal 1'],
    ['Forecast', 'Show the forecast'],
    ['Claimable now', 'What is claimable now?'],
  ],
};

// The conversation is kept for the session so it survives switching screens (never stored on disk).
let CHAT: Turn[] = [];

const EXAMPLES: Record<'de' | 'en', string[]> = {
  de: ['Visualisiere Ziel 2', 'Ziel 1 nach Fallführung', 'Warum sind Leute bei Ziel 1 im Rückstand?', 'Zeig die Prognose', 'Warum zählt ein Praktikum nicht für Ziel 2?', 'Ab wann gilt die 2027-Regel?'],
  en: ['Visualise goal 2', 'Goal 1 by social worker', 'Why are people behind on goal 1?', 'Show the forecast', "Why doesn't an internship count for goal 2?", 'When does the 2027 rule apply?'],
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
  const [chat, setChat] = useState<Turn[]>(CHAT);
  const [sel, setSel] = useState<string | undefined>(() => [...CHAT].reverse().find((t) => t.charts.length || t.passages.length)?.id);
  const [autoSpeak, setAutoSpeak] = useState(false);
  const [convo, setConvo] = useState(false);
  const [settings, setSettings] = useState(false);
  const [err, setErr] = useState<string | undefined>();
  const voice = useVoice(app.rules);
  const abort = useRef<AbortController | null>(null);
  const convoRef = useRef(false);
  const thread = useRef<HTMLDivElement>(null);
  useEffect(
    () => () => {
      abort.current?.abort();
      convoRef.current = false;
    },
    [],
  );
  useEffect(() => {
    thread.current?.scrollTo({ top: thread.current.scrollHeight, behavior: 'smooth' });
  }, [chat]);

  const update = (id: string, patch: Partial<Turn>) => {
    CHAT = CHAT.map((x) => (x.id === id ? { ...x, ...patch } : x));
    setChat(CHAT);
  };

  // Names that must never be spoken by the cloud voice: clients (first and last names) and social workers.
  const blockNames = useMemo(() => {
    const out = new Set<string>();
    for (const p of res?.persons ?? []) if (!p.displayName.startsWith('K-')) out.add(p.displayName.split(/\s+/)[0]);
    for (const r of Object.values(app.sa.extr)) for (const x of r.persons) for (const w of x.name.split(/\s+/)) if (w.length > 2) out.add(w);
    for (const s of res?.socialWorkers ?? []) for (const w of s.split(/[\s.]+/)) if (w.length > 2) out.add(w);
    return [...out];
  }, [res, app.sa.extr]);

  /** Ask one question; resolves with the answer text when it is complete. */
  const ask = async (question: string, spoken = false): Promise<string> => {
    const text = question.trim();
    if (!text) return '';
    setErr(undefined);
    abort.current?.abort();
    const ctl = new AbortController();
    abort.current = ctl;
    const id = String(Date.now());
    const prev = [...CHAT].reverse().find((t) => t.state === 'done' || t.state === 'offline');
    setQ('');

    // Questions about one person go to that person's page (rules, sources), never to the AI model.
    const people = res ? matchPeople(text, app.visible!.persons) : [];
    if (people.length) {
      CHAT = [...CHAT, { id, q: text, lang, a: '', passages: [], charts: [], state: 'person', people, spoken }];
      setChat(CHAT);
      return tr(lang, 'ask.person');
    }

    // Which charts fit (a follow-up like "and by social worker?" stays on the previous goal).
    const prevGoal = prev?.charts.find((c) => c.goal)?.goal ?? (prev ? goalIn(prev.q) : undefined);
    const specs = res ? detectCharts(text, prevGoal).filter((s) => chartData(s, app, res)) : [];
    CHAT = [...CHAT, { id, q: text, lang, a: '', passages: [], charts: specs, state: 'search', spoken }];
    setChat(CHAT);
    if (specs.length) setSel(id);

    const ai = app.rules.ai;
    const query = text.length < 40 && prev ? `${prev.q} ${text}` : text;
    let qv: number[] | undefined;
    try {
      qv = await embedQuery(query, ai.endpoint, ai.embed_model ?? 'nomic-embed-text');
    } catch {
      qv = undefined;
    }
    // Chart questions: the chart numbers carry the answer, so fewer passages (shorter prompt, faster reply).
    const passages = retrieve(query, qv, specs.length ? 2 : 5);
    if (!specs.length) setSel(id);
    if (!qv) {
      update(id, { passages, state: 'offline' });
      return '';
    }
    update(id, { passages, state: 'write' });
    try {
      const totals = res && !specs.length ? totalsText(app, res) : '';
      const charts = res ? specs.map((s) => chartData(s, app, res)!.summary).join('\n') : '';
      const history = CHAT.filter((t) => t.id !== id && t.state === 'done').map((t) => ({ q: t.q, a: t.a }));
      const a = await streamAnswer(ai.endpoint, ai.model, buildMessages(lang, text, passages, totals, history, charts), (t) => update(id, { a: t }), ctl.signal);
      update(id, { a, state: 'done' });
      return a;
    } catch (e) {
      if ((e as Error).name !== 'AbortError') update(id, { state: 'error', err: String(e) });
      return '';
    }
  };

  const say = async (id: string, text: string) => {
    if (text) await voice.speak(text, lang, id, blockNames);
  };

  const sttError = (e: unknown) => {
    const st = (e as { status?: number }).status;
    const name = (e as Error).name ?? '';
    const m = String((e as Error).message ?? e);
    // Browser refused the microphone (NotAllowedError / NotFoundError) -> ask to allow it; only a real
    // ElevenLabs answer about the key's permissions means the key needs "Speech to Text".
    if (/NotAllowed|NotFound|NotReadable|Security/i.test(name) || /getUserMedia|Permission denied|Requested device not found/i.test(m)) setErr(tr(lang, 'chat.err.mic'));
    else if (st === 401 || /missing_permissions|speech_to_text/i.test(m)) setErr(tr(lang, 'chat.err.stt401'));
    else setErr(tr(lang, 'chat.err.stt', { e: m }));
  };

  /** Mic button: speak one question, it is sent as soon as you stop talking. */
  const mic = async () => {
    if (voice.phase === 'listening') return voice.stopListening();
    try {
      const text = await voice.listen(lang);
      if (!text) return;
      const a = await ask(text, true);
      const last = CHAT[CHAT.length - 1];
      if (autoSpeak && a && last) await say(last.id, a);
    } catch (e) {
      sttError(e);
    }
  };

  /** Conversation mode: listen -> answer -> speak -> listen again, until ended. */
  const startConvo = async () => {
    convoRef.current = true;
    setConvo(true);
    let empty = 0;
    while (convoRef.current) {
      let text = '';
      try {
        text = await voice.listen(lang);
      } catch (e) {
        sttError(e);
        break;
      }
      if (!convoRef.current) break;
      if (!text) {
        if (++empty >= 2) break;
        continue;
      }
      empty = 0;
      voice.setPhase('transcribing');
      const a = await ask(text, true);
      voice.setPhase('idle');
      if (!convoRef.current) break;
      const last = CHAT[CHAT.length - 1];
      await say(last.id, a || (last.state === 'offline' ? tr(lang, 'ask.offline') : ''));
    }
    convoRef.current = false;
    setConvo(false);
    voice.setPhase('idle');
  };
  const endConvo = () => {
    convoRef.current = false;
    voice.cancelListening();
    voice.stop();
    setConvo(false);
  };

  const submit = async () => {
    const text = q;
    const a = await ask(text);
    const last = CHAT[CHAT.length - 1];
    if (autoSpeak && a && last) await say(last.id, a);
  };

  const selTurn = chat.find((t) => t.id === sel);
  const busy = chat.some((t) => t.state === 'search' || t.state === 'write');

  const renderAnswer = (t: Turn) =>
    t.a.split(/(\[(?:\d+|K|G)\])/g).map((p, i) => {
      const m = p.match(/^\[(\d+|K|G)\]$/);
      if (!m) return <span key={i}>{p}</span>;
      const n = m[1];
      const title = n === 'K' ? tr(lang, 'ask.k') : n === 'G' ? tr(lang, 'chat.computed') : t.passages[Number(n) - 1] ? `${t.passages[Number(n) - 1].source} · ${t.passages[Number(n) - 1].title}` : '';
      return (
        <sup key={i} className="cite" title={title}>
          {n === 'G' ? '▮' : n}
        </sup>
      );
    });

  const phaseText = voice.phase === 'listening' ? tr(lang, 'chat.listening') : voice.phase === 'transcribing' ? tr(lang, 'chat.transcribing') : voice.phase === 'speaking' ? tr(lang, 'chat.speaking') : busy ? tr(lang, 'chat.thinking') : '';

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{tr(lang, 'chat.title')}</h1>
          <p className="sub">{tr(lang, 'chat.sub')}</p>
        </div>
        {chat.length > 0 && (
          <button
            type="button"
            className="btn small"
            onClick={() => {
              endConvo();
              abort.current?.abort();
              CHAT = [];
              setChat([]);
              setSel(undefined);
            }}
          >
            {Icon.plus()} {tr(lang, 'chat.new')}
          </button>
        )}
      </div>

      <div className="chat-layout">
        <section className="panel chat-pane" aria-label={tr(lang, 'chat.title')}>
          <div className="chat-thread" ref={thread} aria-live="polite">
            {chat.length === 0 && (
              <div className="chat-empty">
                <span className="chat-empty-badge" aria-hidden="true">{Icon.wave()}</span>
                <span className="chat-empty-title">{tr(lang, 'chat.empty.title')}</span>
                <span className="chat-empty-sub">{tr(lang, 'chat.empty.sub')}</span>
                {([
                  ['chat.ex.charts', EXAMPLES[lang].filter((e) => detectCharts(e).length > 0), Icon.chart],
                  ['chat.ex.rules', EXAMPLES[lang].filter((e) => detectCharts(e).length === 0), Icon.doc],
                ] as const).map(([label, list, icon]) => (
                  <div key={label} className="chat-ex-group">
                    <span className="sec-title">{tr(lang, label)}</span>
                    <div className="chat-examples">
                      {list.map((e) => (
                        <button key={e} type="button" className="chat-example" onClick={() => void ask(e)}>
                          <span className="chat-example-icon" aria-hidden="true">{icon()}</span>
                          <span>{e}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {chat.map((t) => (
              <div key={t.id} className="chat-turn">
                <div className="bubble user">
                  {t.spoken && <span className="bubble-mic" aria-label={tr(lang, 'chat.mic')}>{Icon.mic()}</span>}
                  {t.q}
                </div>
                <div className={`bubble bot${sel === t.id ? ' sel' : ''}`}>
                  {t.state === 'search' && <span className="muted typing">{tr(lang, 'ask.searching')}</span>}
                  {t.state === 'write' && !t.a && <span className="muted typing">{tr(lang, 'ask.writing')}</span>}
                  {t.a && <p>{renderAnswer(t)}</p>}
                  {t.state === 'offline' && <p className="muted">{tr(lang, 'ask.offline')}</p>}
                  {t.state === 'error' && <p className="muted">{tr(lang, 'ask.error', { e: t.err ?? '' })}</p>}
                  {t.state === 'person' && (
                    <>
                      <p>{tr(lang, 'ask.person')}</p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {t.people!.map((p) => (
                          <button key={p.id} type="button" className="btn small" onClick={() => app.openClient(p.id)}>
                            {p.name} · {p.id} · {p.sw} →
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {res && t.charts.length > 0 && (
                    <div className="inline-charts">
                      {t.charts.map((c, i) => {
                        const d = chartData(c, app, res);
                        return d ? <ChartView key={i} data={d} lang={lang} compact /> : null;
                      })}
                      <span className="tag good" style={{ alignSelf: 'flex-start' }}>{tr(lang, 'chat.computed')}</span>
                    </div>
                  )}
                  {(t.charts.length > 0 || t.passages.length > 0) && (
                    <div className="bubble-actions">
                      {(t.charts.length > 0 || t.passages.length > 0) && (
                        <button type="button" className={`chip-btn${sel === t.id ? ' on' : ''}`} onClick={() => setSel(t.id)}>
                          {Icon.chart()} {t.charts.length ? tr(lang, 'chat.charts', { n: t.charts.length }) : tr(lang, 'ask.sources', { n: t.passages.length })}
                        </button>
                      )}
                      {t.a && (t.state === 'done' || t.state === 'write') && (
                        <button
                          type="button"
                          className="icon-btn small"
                          aria-label={voice.speaking === t.id ? tr(lang, 'ask.stop') : tr(lang, 'ask.read')}
                          title={voice.speaking === t.id ? tr(lang, 'ask.stop') : tr(lang, 'ask.read')}
                          onClick={() => (voice.speaking === t.id ? voice.stop() : void say(t.id, t.a))}
                        >
                          {voice.speaking === t.id ? Icon.stop() : Icon.speaker()}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {(err || voice.note) && (
            <div className="note" role="status" style={{ margin: '0 16px 8px' }}>
              {err ?? tr(lang, `ask.note.${voice.note}` as UiKey)}
            </div>
          )}

          <form
            className="composer"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <textarea
              className="composer-input"
              rows={1}
              placeholder={voice.phase === 'listening' ? tr(lang, 'chat.listening') : tr(lang, 'chat.placeholder')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              aria-label={tr(lang, 'chat.placeholder')}
            />
            <div className="composer-bar">
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className={`icon-btn${autoSpeak ? ' on' : ''}`}
                  aria-pressed={autoSpeak}
                  title={tr(lang, autoSpeak ? 'chat.speaker.on' : 'chat.speaker.off')}
                  aria-label={tr(lang, autoSpeak ? 'chat.speaker.on' : 'chat.speaker.off')}
                  onClick={() => setAutoSpeak(!autoSpeak)}
                >
                  {autoSpeak ? Icon.speaker() : Icon.speakerOff()}
                </button>
                <div style={{ position: 'relative' }}>
                  <button type="button" className={`icon-btn${settings ? ' on' : ''}`} aria-expanded={settings} title={tr(lang, 'chat.settings')} aria-label={tr(lang, 'chat.settings')} onClick={() => setSettings(!settings)}>
                    {Icon.gear()}
                  </button>
                  {settings && (
                    <div className="popover" role="dialog" aria-label={tr(lang, 'chat.settings')}>
                      <span className="sec-title">{tr(lang, 'chat.settings')}</span>
                      <label className="radio">
                        <input type="radio" name="voice" checked={voice.mode === 'elevenlabs'} disabled={voice.cloud === false} onChange={() => voice.setMode('elevenlabs')} />
                        {tr(lang, 'chat.voice.eleven')}
                      </label>
                      <label className="radio">
                        <input type="radio" name="voice" checked={voice.mode === 'local'} onChange={() => voice.setMode('local')} />
                        {tr(lang, 'chat.voice.local')}
                      </label>
                      <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'chat.privacy.mic')}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'chat.privacy.voice')}</span>
                      <span className="muted" style={{ fontSize: 12 }}>{tr(lang, 'chat.privacy.local')}</span>
                    </div>
                  )}
                </div>
                {phaseText && <span className="muted" style={{ fontSize: 12 }}>{phaseText}</span>}
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <button
                  type="button"
                  className={`icon-btn${convo ? ' rec' : ''}`}
                  title={convo ? tr(lang, 'chat.convo.on') : `${tr(lang, 'chat.convo')}: ${tr(lang, 'chat.convo.hint')}`}
                  aria-label={convo ? tr(lang, 'chat.convo.on') : tr(lang, 'chat.convo')}
                  disabled={voice.cloud === false && !convo}
                  onClick={() => (convo ? endConvo() : void startConvo())}
                >
                  {Icon.wave()}
                </button>
                <button
                  type="button"
                  className={`icon-btn${voice.phase === 'listening' && !convo ? ' rec' : ''}`}
                  title={voice.phase === 'listening' ? tr(lang, 'chat.mic.stop') : tr(lang, 'chat.mic')}
                  aria-label={voice.phase === 'listening' ? tr(lang, 'chat.mic.stop') : tr(lang, 'chat.mic')}
                  disabled={convo || voice.cloud === false || voice.phase === 'transcribing'}
                  onClick={() => void mic()}
                >
                  {Icon.mic()}
                </button>
                <button type="submit" className="icon-btn send" disabled={!q.trim() || busy} aria-label={tr(lang, 'chat.send')} title={tr(lang, 'chat.send')}>
                  {Icon.send()}
                </button>
              </div>
            </div>
          </form>
        </section>

        <aside className="panel canvas" aria-label={tr(lang, 'chat.canvas')}>
          <div className="panel-head">
            <span className="panel-title">{tr(lang, 'chat.canvas')}</span>
            {selTurn && <span className="muted" style={{ fontSize: 12, maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selTurn.q}</span>}
          </div>
          <div className="canvas-body">
            {!selTurn && (
              <div className="canvas-empty">
                <div className="canvas-skeleton" aria-hidden="true">
                  {[72, 48, 88, 30, 60].map((w, i) => (
                    <div key={i} className="sk-row">
                      <span className="sk-label" />
                      <span className="sk-bar" style={{ width: `${w}%`, animationDelay: `${i * 0.12}s` }} />
                    </div>
                  ))}
                </div>
                <span className="canvas-empty-title">{tr(lang, 'chat.canvas.title')}</span>
                <span className="muted" style={{ fontSize: 13, textAlign: 'center', maxWidth: 380 }}>{tr(lang, 'chat.canvas.empty')}</span>
                <div className="canvas-kinds">
                  {CANVAS_KINDS[lang].map(([label, question]) => (
                    <button key={label} type="button" className="chip-btn" disabled={!res} onClick={() => void ask(question)}>
                      {Icon.chart()} {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {selTurn && res && selTurn.charts.length > 0 && (
              <>
                {selTurn.charts.map((s, i) => {
                  const d = chartData(s, app, res);
                  return d ? <ChartView key={i} data={d} lang={lang} /> : null;
                })}
                <span className="tag good" style={{ alignSelf: 'flex-start' }}>{tr(lang, 'chat.computed')}</span>
              </>
            )}
            {selTurn && selTurn.passages.length > 0 && (
              <div className="canvas-sources">
                <span className="sec-title">{tr(lang, 'ask.sources', { n: selTurn.passages.length })}</span>
                {selTurn.passages.map((p, i) => (
                  <details key={p.id}>
                    <summary>
                      <strong>[{i + 1}]</strong> {p.source} · <span className="muted">{p.title}</span>
                    </summary>
                    <p>{p.text.length > 600 ? `${p.text.slice(0, 600)} …` : p.text}</p>
                  </details>
                ))}
                <span className="tag ai" style={{ alignSelf: 'flex-start', whiteSpace: 'normal' }}>{tr(lang, 'ask.tag')}</span>
              </div>
            )}
          </div>
        </aside>
      </div>

      {convo && (
        <div className={`voice-bar ${voice.phase === 'idle' ? 'thinking' : voice.phase}`} role="status" aria-live="polite">
          <span className="voice-dot" aria-hidden="true" />
          <div className="voice-viz" aria-hidden="true">
            {[0.45, 0.7, 1, 0.8, 0.55, 0.9, 0.5].map((f, i) => (
              <span key={i} style={voice.phase === 'listening' ? { height: `${6 + Math.min(1, voice.level * (0.6 + f)) * 26}px` } : { animationDelay: `${i * 0.09}s` }} />
            ))}
          </div>
          <span className="voice-text">{phaseText || tr(lang, 'chat.listening')}</span>
          <button type="button" className="voice-end" onClick={endConvo} aria-label={tr(lang, 'chat.convo.on')} title={tr(lang, 'chat.convo.on')}>
            {Icon.stop()}
          </button>
        </div>
      )}
      {!res && <div className="note info">{tr(lang, 'ask.norun')}</div>}
    </>
  );
}
