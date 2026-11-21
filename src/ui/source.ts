// Remembered data source. Only a *reference* is kept in this browser: the sample month, or the handle
// of the folder the user chose (File System Access API, Chrome / Edge). No client data is stored;
// the files are read again from the folder each time the cockpit opens.

export type Source = { kind: 'sample'; month: '2026-10' | '2026-11' } | { kind: 'folder'; name: string } | { kind: 'files' };

const KEY = 'ic.source';
const DB = 'ic-source';
const STORE = 'handles';

/* eslint-disable @typescript-eslint/no-explicit-any */
type DirHandle = {
  kind: 'directory';
  name: string;
  values(): AsyncIterable<any>;
  queryPermission?(o: { mode: 'read' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'read' }): Promise<PermissionState>;
};

export const canRememberFolder = typeof window !== 'undefined' && 'showDirectoryPicker' in window && 'indexedDB' in window;

export function loadSource(): Source | undefined {
  try {
    const v = localStorage.getItem(KEY);
    return v ? (JSON.parse(v) as Source) : undefined;
  } catch {
    return undefined;
  }
}

export function saveSource(s: Source | undefined) {
  try {
    if (!s || s.kind === 'files') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage blocked: nothing is remembered, the app still works */
  }
}

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  try {
    const d = await db();
    return await new Promise<T | undefined>((resolve, reject) => {
      const req = f(d.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}

export const saveHandle = (h: DirHandle) => tx('readwrite', (s) => s.put(h, 'folder'));
export const loadHandle = () => tx<DirHandle>('readonly', (s) => s.get('folder'));
export const clearHandle = () => tx('readwrite', (s) => s.delete('folder'));

export async function pickFolder(): Promise<DirHandle | undefined> {
  try {
    return (await (window as any).showDirectoryPicker({ id: 'ic-exports', mode: 'read' })) as DirHandle;
  } catch {
    return undefined; // cancelled
  }
}

/** Is reading the folder allowed without asking? 'prompt' needs a click (requestPermission). */
export async function permission(h: DirHandle, ask: boolean): Promise<boolean> {
  try {
    const q = await h.queryPermission?.({ mode: 'read' });
    if (q === 'granted') return true;
    if (!ask) return false;
    return (await h.requestPermission?.({ mode: 'read' })) === 'granted';
  } catch {
    return false;
  }
}

/** Excel files in the folder and one level of subfolders (exports are sometimes put in a month folder). */
export async function readFolder(h: DirHandle, depth = 1): Promise<File[]> {
  const out: File[] = [];
  for await (const e of h.values()) {
    if (e.kind === 'file' && /\.(xlsx|xls|xlsm|csv)$/i.test(e.name) && !e.name.startsWith('~$')) out.push(await e.getFile());
    else if (e.kind === 'directory' && depth > 0 && !e.name.startsWith('.')) out.push(...(await readFolder(e as DirHandle, depth - 1)));
  }
  return out;
}

/** A folder dropped on the page (Chrome / Edge give a handle that can be remembered). */
export async function droppedFolder(dt: DataTransfer): Promise<DirHandle | undefined> {
  const item = dt.items?.[0] as any;
  if (!item?.getAsFileSystemHandle) return undefined;
  try {
    const h = await item.getAsFileSystemHandle();
    return h?.kind === 'directory' ? (h as DirHandle) : undefined;
  } catch {
    return undefined;
  }
}

export type { DirHandle };
