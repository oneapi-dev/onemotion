/**
 * Recorded voiceover lines, kept in this browser (IndexedDB) so a video's
 * narration is paid for once: reopening, re-exporting or editing another
 * line reuses every line already read. Where IndexedDB is unavailable
 * (private windows, blocked storage) lines live for the session only.
 */

const DB = "oneapi-motion-voice";
const STORE = "lines";
const memory = new Map<string, Blob>();
let opening: Promise<IDBDatabase | null> | null = null;

function db(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((resolve) => {
        if (!d) return resolve(undefined);
        try {
          const req = work(d.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      }),
  );
}

export async function getLine(key: string): Promise<Blob | undefined> {
  const hit = memory.get(key);
  if (hit) return hit;
  const stored = await run<Blob>("readonly", (s) => s.get(key) as IDBRequest<Blob>);
  if (stored instanceof Blob) memory.set(key, stored);
  return stored instanceof Blob ? stored : undefined;
}

export async function putLine(key: string, blob: Blob): Promise<void> {
  memory.set(key, blob);
  await run("readwrite", (s) => s.put(blob, key));
}
