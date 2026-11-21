import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fmt, parseDate, type Day } from '../engine/dates';
import { defaultRulesText } from '../engine/defaultRules';
import { analyzeFiles, mappingKey, parseTables, runBlocked, type FileAnalysis, type MappingSuggestion, type RawTable, type SavedMappings } from '../engine/import/detect';
import { readWorkbook } from '../engine/import/read';
import { TABLES } from '../engine/import/signatures';
import type { GoalId, RunResult } from '../engine/model';
import { parseRules, type Rules } from '../engine/rules';
import { resolveStichtag, run } from '../engine/run';
import { writeAll, type OutFile } from '../excel/write';
import type { Lang } from '../i18n/messages';
import { tr } from './strings';
import { useSa } from './useSa';
import { canRememberFolder, clearHandle, loadHandle, loadSource, permission, pickFolder, readFolder, saveHandle, saveSource, type DirHandle, type Source } from './source';

export type Screen = 'run' | 'overview' | 'goal' | 'calls' | 'clients' | 'client' | 'ask' | 'quality' | 'export' | 'situation' | 'patterns';
const SCREENS: Screen[] = ['run', 'overview', 'goal', 'calls', 'clients', 'client', 'ask', 'quality', 'export', 'situation', 'patterns'];

/** Screens live in the URL hash (#/goal/2), so the browser's back and forward buttons move inside the app. */
function parseHash(): { screen?: Screen; goal?: GoalId; client?: string } {
  const m = (typeof location !== 'undefined' ? location.hash : '').match(/^#\/(\w+)(?:\/([^/?#]+))?/);
  const screen = m && SCREENS.includes(m[1] as Screen) ? (m[1] as Screen) : undefined;
  const p = m?.[2] ? decodeURIComponent(m[2]) : undefined;
  return { screen, goal: screen === 'goal' && p && /^[123]$/.test(p) ? (Number(p) as GoalId) : undefined, client: screen === 'client' ? p : undefined };
}
const hashFor = (s: Screen, g: GoalId, client?: string) => `#/${s}${s === 'goal' ? `/${g}` : s === 'client' && client ? `/${encodeURIComponent(client)}` : ''}`;
export type Role = { kind: 'mgmt' } | { kind: 'sw'; name: string };
export interface LogLine {
  t: string;
  text: string;
  state: 'done' | 'run' | 'wait';
}

// Browser storage: only mappings, marks, language, custom rules. Never client data. Wrapped: storage may be blocked.
function load<T>(k: string, fallback: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(k: string, v: unknown) {
  try {
    if (v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked: app still works, mappings are asked again */
  }
}

const tick = () => new Promise((r) => setTimeout(r, 30));
const clock = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
};

export function useApp() {
  const [lang, setLangState] = useState<Lang>(() => load<Lang>('ic.lang', 'de'));
  const [screen, setScreenState] = useState<Screen>(() => parseHash().screen ?? 'run');
  const [role, setRoleState] = useState<Role>(() => {
    try {
      const v = sessionStorage.getItem('ic.role');
      return v ? (JSON.parse(v) as Role) : { kind: 'mgmt' };
    } catch {
      return { kind: 'mgmt' };
    }
  });
  const setRole = (r: Role) => {
    setRoleState(r);
    try {
      sessionStorage.setItem('ic.role', JSON.stringify(r));
    } catch {
      /* not remembered */
    }
  };
  const [raws, setRaws] = useState<RawTable[]>([]);
  const [saved, setSaved] = useState<SavedMappings>(() => load('ic.mappings', {}));
  const [isDemo, setIsDemo] = useState(false);
  const [customRules, setCustomRules] = useState<string | undefined>(() => load<string | undefined>('ic.rules', undefined));
  const [stichtagOverride, setStichtagOverride] = useState<Day | undefined>();
  const [windowMonths, setWindowMonths] = useState<number | undefined>();
  const [result, setResult] = useState<RunResult | undefined>();
  const [files, setFiles] = useState<OutFile[]>([]);
  const [log, setLog] = useState<LogLine[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [called, setCalled] = useState<Record<string, boolean>>(() => load('ic.called', {}));
  const [loading, setLoading] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(() => parseHash().client);
  const [callsSw, setCallsSw] = useState<string | undefined>();
  const [dqOpen, setDqOpen] = useState<string | undefined>();
  const [inScopeOnly, setInScopeOnly] = useState(false);
  const [goalId, setGoalIdState] = useState<GoalId>(() => parseHash().goal ?? 1);
  const goalRef = useRef(goalId);
  goalRef.current = goalId;
  const [source, setSource] = useState<Source | undefined>(() => loadSource());
  const [folderWaiting, setFolderWaiting] = useState<string | undefined>(); // remembered folder that needs one click to allow reading
  const [autoRun, setAutoRun] = useState(false);
  const [restoring, setRestoring] = useState(() => { const s = loadSource(); return !!s && s.kind !== 'files'; });

  const setScreen = useCallback((s: Screen, g?: GoalId) => {
    const goal = g ?? goalRef.current;
    if (g) setGoalIdState(g);
    setScreenState(s);
    const h = hashFor(s, goal);
    if (location.hash !== h) history.pushState(null, '', h);
  }, []);
  const setGoalId = useCallback((g: GoalId) => {
    setGoalIdState(g);
    if (location.hash.startsWith('#/goal')) history.replaceState(null, '', hashFor('goal', g));
  }, []);
  useEffect(() => {
    if (!location.hash) history.replaceState(null, '', hashFor(screen, goalRef.current));
    const on = () => {
      const r = parseHash();
      setScreenState(r.screen ?? 'run');
      if (r.goal) setGoalIdState(r.goal);
      if (r.client) setSelected(r.client);
    };
    window.addEventListener('popstate', on);
    return () => window.removeEventListener('popstate', on);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    save('ic.lang', l);
    document.documentElement.lang = l;
  };
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const rulesText = customRules ?? defaultRulesText;
  const rules: Rules = useMemo(() => {
    try {
      return parseRules(rulesText);
    } catch {
      return parseRules(defaultRulesText);
    }
  }, [rulesText]);

  const sa = useSa(rules.ai);

  const analyses: FileAnalysis[] = useMemo(() => analyzeFiles(raws, saved), [raws, saved]);
  const blocked = runBlocked(analyses);
  const autoStichtag = useMemo(() => resolveStichtag(rules, analyses), [rules, analyses]);

  const addFiles = useCallback(async (list: File[] | FileList, demo = false, src: Source = { kind: 'files' }) => {
    setError(undefined);
    setLoading(true);
    try {
      const arr = Array.from(list).filter((f) => /\.(xlsx|xls|xlsm|csv)$/i.test(f.name) && !f.name.startsWith('~$'));
      const read: RawTable[] = [];
      for (const f of arr) read.push(readWorkbook(new Uint8Array(await f.arrayBuffer()), f.name, f.lastModified));
      setRaws(read);
      setIsDemo(demo);
      setSource(src);
      saveSource(src);
      setFolderWaiting(undefined);
      if (src.kind !== 'folder') void clearHandle();
      setResult(undefined);
      setFiles([]);
      setLog([]);
      setStichtagOverride(undefined);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  const loadSample = useCallback(
    async (month: '2026-10' | '2026-11') => {
      setLoading(true);
      setError(undefined);
      try {
        const out: File[] = [];
        for (const t of TABLES) {
          const r = await fetch(`./sample-data/${month}/${encodeURIComponent(t.file)}`);
          if (!r.ok) continue;
          out.push(new File([await r.arrayBuffer()], t.file));
        }
        if (!out.length) throw new Error('sample data not found');
        await addFiles(out, true, { kind: 'sample', month });
        await sa.loadSample(month);
      } catch (e) {
        setError(String(e));
        setLoading(false);
      }
    },
    [addFiles, sa],
  );

  const openFolder = useCallback(
    async (h: DirHandle) => {
      setLoading(true);
      try {
        const files = await readFolder(h);
        if (!files.length) throw new Error(tr(lang, 'src.empty', { name: h.name }));
        await saveHandle(h);
        await addFiles(files, false, { kind: 'folder', name: h.name });
        return true;
      } catch (e) {
        setError(String(e instanceof Error ? e.message : e));
        setLoading(false);
        return false;
      }
    },
    [addFiles, lang],
  );

  /** Choose a folder; it is remembered and loaded again every time the cockpit opens. */
  const chooseFolder = useCallback(async () => {
    const h = await pickFolder();
    if (h && (await openFolder(h))) setAutoRun(true);
  }, [openFolder]);

  /** The remembered folder needs one click before the browser lets us read it again. */
  const reopenFolder = useCallback(async () => {
    const h = await loadHandle();
    if (h && (await permission(h, true)) && (await openFolder(h))) setAutoRun(true);
  }, [openFolder]);

  const forgetSource = () => {
    setSource(undefined);
    saveSource(undefined);
    setFolderWaiting(undefined);
    void clearHandle();
  };

  // On open: load the remembered source again and calculate, so the cockpit shows the same data until another source is chosen.
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    const src = loadSource();
    if (!src) return;
    const stop = setTimeout(() => setRestoring(false), 20000); // never show "loading" forever
    void (async () => {
      if (src.kind === 'sample') {
        await loadSample(src.month);
        setAutoRun(true);
      } else if (src.kind === 'folder') {
        const h = await loadHandle();
        if (!h) {
          setRestoring(false);
          return;
        }
        if (await permission(h, false)) {
          if (await openFolder(h)) setAutoRun(true);
        } else setFolderWaiting(h.name);
      }
    })().finally(() => {
      clearTimeout(stop);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Confirm a column mapping (the suggested header, or another header the user chose). */
  const acceptMapping = (s: MappingSuggestion) => {
    const next = { ...saved, [mappingKey(s.table, s.fileHeader)]: s.colKey };
    setSaved(next);
    save('ic.mappings', next);
  };

  /** Full page for one client (its own address, so back returns to where you came from). */
  const openClient = (id: string) => {
    setSelected(id);
    setScreenState('client');
    const h = hashFor('client', goalRef.current, id);
    if (location.hash !== h) history.pushState(null, '', h);
    window.scrollTo?.(0, 0);
  };

  /** Back to the very start for a demo rehearsal: loaded data, remembered source, column mappings, marks and confirmed report fields. */
  const resetDemo = () => {
    clearLocal();
    setRaws([]);
    setIsDemo(false);
    setResult(undefined);
    setFiles([]);
    setLog([]);
    setProgress(0);
    setError(undefined);
    setStichtagOverride(undefined);
    setSelected(undefined);
    setRestoring(false);
    setScreen('run');
  };

  const clearLocal = () => {
    sa.clear();
    setSource(undefined);
    saveSource(undefined);
    setFolderWaiting(undefined);
    void clearHandle();
    setSaved({});
    setCalled({});
    setCustomRules(undefined);
    save('ic.mappings', undefined);
    save('ic.called', undefined);
    save('ic.rules', undefined);
  };

  const toggleCalled = (id: string) => {
    const next = { ...called, [id]: !called[id] };
    setCalled(next);
    save('ic.called', next);
  };

  const setRulesText = (text: string | undefined) => {
    if (text !== undefined) parseRules(text); // throws on bad YAML
    setCustomRules(text);
    save('ic.rules', text);
  };

  /** Lump sums per reached goal, written into rules.yaml (so Excel's Regeln sheet shows them too); then recalculate. */
  const setLumpSums = (v: Record<1 | 2 | 3, number | null>) => {
    const text = rulesText.replace(/^(\s+goal([123]):\s*)(null|[\d.]+)/gm, (_m, pre: string, g: string) => `${pre}${v[Number(g) as 1 | 2 | 3] ?? 'null'}`);
    setRulesText(text);
    setAutoRun(true);
  };

  const doRun = useCallback(async () => {
    if (blocked || !raws.length) return;
    setRunning(true);
    setError(undefined);
    const t0 = performance.now();
    const lines: LogLine[] = [];
    const push = (text: string) => {
      lines.forEach((l) => (l.state = 'done'));
      lines.push({ t: clock(), text, state: 'run' });
      setLog([...lines]);
    };
    try {
      const steps = 7;
      let s = 0;
      const step = async (text: string) => {
        push(text);
        setProgress(++s / steps);
        await tick();
      };
      await step(tr(lang, 'run.log.read', { n: raws.length }));
      const found = new Set(analyses.filter((a) => a.table && a.status !== 'duplicate' && a.status !== 'unknown').map((a) => a.table)).size;
      await step(tr(lang, 'run.log.detect', { n: found }));
      const parsed = parseTables(raws, analyses);
      const nrows = Object.values(parsed.tables).reduce((x, r) => x + (r?.length ?? 0), 0);
      await step(tr(lang, 'run.log.parse', { n: nrows.toLocaleString('de-CH') }));
      const r2 = { ...rules, at_risk_window_months: windowMonths ?? rules.at_risk_window_months };
      const st = stichtagOverride ?? autoStichtag ?? parseDate(fmtToday())!;
      const res = run({
        parsed,
        rules: r2,
        stichtag: st,
        inputs: analyses.map((a) => ({ fileName: a.fileName, table: a.table, rows: a.rows })),
      });
      // ASD's exports carry no names (Klient template has none). Show the name from the client's own
      // Situationsanalyse report when it has been read on this computer; otherwise the client number.
      const names = new Map<string, string>();
      for (const r of Object.values(sa.extr)) for (const x of r.persons) names.set(x.zemis, x.name);
      for (const p of res.persons) {
        const n = p.displayName.startsWith('K-') ? names.get(p.zemis) : undefined;
        if (!n) continue;
        const w = n.split(/\s+/);
        p.displayName = w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}.` : w[0];
      }
      await step(tr(lang, 'run.log.population', { n: res.persons.length, date: fmt(st) }));
      const t1 = res.totals[1];
      await step(tr(lang, 'run.log.goal1', { n: t1 ? t1.overall.counted + t1.overall.counts.no_data : 0 }));
      const flagged = Object.values(res.callLists).reduce((x, l) => x + l.length, 0);
      await step(tr(lang, 'run.log.calls', { n: flagged }));
      const out = await writeAll(res, rulesTextWithWindow(rulesText, windowMonths), new Date().toISOString().slice(0, 16).replace('T', ' '), rules.payment.lump_sum_chf as Record<string, number | null>);
      await step(tr(lang, 'run.log.excel', { n: out.length }));
      push(tr(lang, 'run.log.done', { ms: Math.round(performance.now() - t0) }));
      lines.forEach((l) => (l.state = 'done'));
      setLog([...lines]);
      setResult(res);
      setFiles(out);
      setProgress(1);
    } catch (e) {
      setError(String(e));
      console.error(e);
    } finally {
      setRunning(false);
    }
  }, [blocked, raws, analyses, rules, rulesText, windowMonths, stichtagOverride, autoStichtag, lang, sa.extr]);

  useEffect(() => {
    if (!autoRun || !raws.length || running) return;
    setAutoRun(false);
    if (!blocked) void doRun().finally(() => setRestoring(false));
    else {
      setRestoring(false);
      setScreen('run'); // a renamed column needs a person to confirm it first
    }
  }, [autoRun, raws, blocked, running, doRun, setScreen]);

  // what the current role may see
  const visible = useMemo(() => {
    if (!result) return undefined;
    if (role.kind === 'mgmt') return { persons: result.persons, sws: result.socialWorkers };
    return { persons: result.persons.filter((p) => p.socialWorker === role.name), sws: [role.name] };
  }, [result, role]);

  return {
    lang,
    setLang,
    screen,
    setScreen,
    role,
    setRole,
    raws,
    analyses,
    saved,
    blocked,
    isDemo,
    rules,
    rulesText,
    customRules,
    setRulesText,
    setLumpSums,
    autoStichtag,
    stichtagOverride,
    setStichtagOverride,
    windowMonths: windowMonths ?? rules.at_risk_window_months,
    setWindowMonths,
    result,
    files,
    log,
    running,
    progress,
    error,
    setError,
    loading,
    called,
    toggleCalled,
    addFiles,
    loadSample,
    acceptMapping,
    clearLocal,
    doRun,
    visible,
    rulesOpen,
    setRulesOpen,
    selected,
    setSelected,
    callsSw,
    setCallsSw,
    dqOpen,
    setDqOpen,
    inScopeOnly,
    setInScopeOnly,
    goalId,
    setGoalId,
    openGoal: (g: GoalId) => {
      setScreen('goal', g);
      window.scrollTo?.(0, 0);
    },
    source,
    folderWaiting,
    canRememberFolder,
    chooseFolder,
    reopenFolder,
    openFolder,
    forgetSource,
    openClient,
    resetDemo,
    restoring: restoring && !result && !folderWaiting && !error,
    sa,
  };
}

export type App = ReturnType<typeof useApp>;

function fmtToday(): string {
  const d = new Date();
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

/** The Regeln sheet records the window actually used in this run. */
function rulesTextWithWindow(text: string, w: number | undefined): string {
  if (w === undefined) return text;
  return text.replace(/^at_risk_window_months:\s*\d+/m, `at_risk_window_months: ${w}   # set in the Monthly run screen`);
}

export function download(name: string, data: ArrayBuffer | Blob, type = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
