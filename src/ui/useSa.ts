import { useCallback, useState } from 'react';
import { extractReport, type Extracted, type PersonExtraction, type ReportExtraction, type SaFieldId } from '../ai/extract';

export interface SaReport {
  file: string; // key (base name without extension + .txt for sample reports)
  label: string;
  dossier?: string;
  socialWorker?: string;
  newThisMonth: boolean;
  persona?: string | null;
  source: 'sample' | 'upload';
  pdfUrl?: string;
  text?: string;
}

export interface Confirmed {
  value: string | number | null;
  evidence: string;
  file: string;
  status: 'confirmed' | 'left_empty';
}

export interface Accuracy {
  model: string;
  measuredAt: string;
  reports: number;
  persons: number;
  fields: number;
  correct: number;
  accuracy: number;
  evidenceFoundRate: number | null;
}

type Extraction = ReportExtraction & { cached?: boolean };

function load<T>(k: string, f: T): T {
  try {
    const v = localStorage.getItem(k);
    return v ? (JSON.parse(v) as T) : f;
  } catch {
    return f;
  }
}
function save(k: string, v: unknown) {
  try {
    if (v === undefined) localStorage.removeItem(k);
    else localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* blocked storage: confirmations live for this session only */
  }
}

export function useSa(ai: { endpoint: string; model: string }) {
  const [reports, setReports] = useState<SaReport[]>([]);
  const [extr, setExtr] = useState<Record<string, Extraction>>({});
  const [confirmed, setConfirmed] = useState<Record<string, Record<string, Confirmed>>>(() => load('ic.sa.confirmed', {}));
  const [accuracy, setAccuracy] = useState<Accuracy | undefined>();
  const [busy, setBusy] = useState<string | undefined>(); // file being extracted live
  const [livePersons, setLivePersons] = useState<PersonExtraction[]>([]);
  const [error, setError] = useState<string | undefined>();
  const [current, setCurrent] = useState<string | undefined>();

  /** Sample reports: index + cached model results + measured accuracy. Report text is read when opened. */
  const loadSample = useCallback(async (month: string) => {
    try {
      const base = `./sample-data/${month}/situationsanalyse/`;
      const idx = await fetch(base + 'index.json');
      if (!idx.ok || !idx.headers.get('content-type')?.includes('json')) return;
      const list = (await idx.json()) as { file: string; dossier: string; socialWorker: string; newThisMonth: boolean; persona: string | null }[];
      setReports(
        list
          .map((x) => ({
            file: x.file,
            label: `${x.dossier}`,
            dossier: x.dossier,
            socialWorker: x.socialWorker,
            newThisMonth: x.newThisMonth,
            persona: x.persona,
            source: 'sample' as const,
            pdfUrl: base + x.file.replace(/\.txt$/, '.pdf'),
          }))
          .sort((a, b) => Number(b.newThisMonth) - Number(a.newThisMonth) || a.label.localeCompare(b.label)),
      );
      const c = await fetch(base + 'extractions.json');
      if (c.ok && c.headers.get('content-type')?.includes('json')) {
        const all = (await c.json()) as Record<string, ReportExtraction>;
        setExtr((prev) => ({ ...Object.fromEntries(Object.entries(all).map(([k, v]) => [k, { ...v, cached: true }])), ...prev }));
      }
      const a = await fetch(base + 'accuracy.json');
      if (a.ok && a.headers.get('content-type')?.includes('json')) setAccuracy(await a.json());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const addFiles = useCallback(async (files: File[]) => {
    const { readPdfText } = await import('../ai/pdf');
    const added: SaReport[] = [];
    for (const f of files) {
      if (!/\.(pdf|txt)$/i.test(f.name)) continue;
      const text = /\.pdf$/i.test(f.name) ? await readPdfText(await f.arrayBuffer()) : await f.text();
      const key = f.name.replace(/\.pdf$/i, '.txt');
      added.push({ file: key, label: f.name, newThisMonth: true, source: 'upload', text });
    }
    setReports((prev) => [...added, ...prev.filter((p) => !added.some((a) => a.file === p.file))]);
    if (added[0]) setCurrent(added[0].file);
  }, []);

  const ensureText = useCallback(
    async (file: string) => {
      const r = reports.find((x) => x.file === file);
      if (!r || r.text !== undefined || !r.pdfUrl) return;
      try {
        const { readPdfText } = await import('../ai/pdf');
        const res = await fetch(r.pdfUrl);
        const text = await readPdfText(await res.arrayBuffer());
        setReports((prev) => prev.map((x) => (x.file === file ? { ...x, text } : x)));
      } catch (e) {
        setError(String(e));
      }
    },
    [reports],
  );

  const runLive = useCallback(
    async (file: string) => {
      const r = reports.find((x) => x.file === file);
      if (!r?.text) return;
      setBusy(file);
      setLivePersons([]);
      setError(undefined);
      try {
        const res = await extractReport(file, r.text, { endpoint: ai.endpoint, model: ai.model }, (p) => setLivePersons((prev) => [...prev, p]));
        setExtr((prev) => ({ ...prev, [file]: res }));
      } catch (e) {
        setError(String(e));
      } finally {
        setBusy(undefined);
      }
    },
    [reports, ai.endpoint, ai.model],
  );

  const setField = (zemis: string, field: SaFieldId, e: Extracted | undefined, file: string, status: Confirmed['status'] | undefined) => {
    setConfirmed((prev) => {
      const person = { ...(prev[zemis] ?? {}) };
      if (!status) delete person[field];
      else person[field] = { value: status === 'confirmed' ? (e?.value ?? null) : null, evidence: e?.evidence ?? '', file, status };
      const next = { ...prev, [zemis]: person };
      save('ic.sa.confirmed', next);
      return next;
    });
  };

  const clear = () => {
    setConfirmed({});
    save('ic.sa.confirmed', undefined);
  };

  return { reports, extr, confirmed, accuracy, busy, livePersons, error, current, setCurrent, loadSample, addFiles, ensureText, runLive, setField, clear };
}

export type Sa = ReturnType<typeof useSa>;
