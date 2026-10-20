"use client";

import type { FilmState } from "@/bespoke/agent/run";

/**
 * Every version of a bespoke film, kept in this browser (IndexedDB: a film
 * with its code is too big to keep many of in localStorage), so an edit
 * can be undone and redone. Each project has a list of versions and the one
 * it is at; a new edit after an undo drops the versions after it.
 */

export type Version = { at: string; label: string; film: FilmState };
export type History = { versions: Version[]; index: number };

const DB = "onemotion-history";
const STORE = "films";
const KEEP = 20;
const memory = new Map<string, History>();
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

export async function loadHistory(projectId: string): Promise<History> {
  const hit = memory.get(projectId) ?? (await run<History>("readonly", (s) => s.get(projectId) as IDBRequest<History>));
  return hit && Array.isArray(hit.versions) ? hit : { versions: [], index: -1 };
}

async function save(projectId: string, h: History): Promise<History> {
  memory.set(projectId, h);
  await run("readwrite", (s) => s.put(h, projectId));
  return h;
}

/** A pure step: the history after recording `film`, dropping any redo versions and the oldest beyond the limit. */
export function pushVersion(h: History, v: Version): History {
  const versions = [...h.versions.slice(0, h.index + 1), v].slice(-KEEP);
  return { versions, index: versions.length - 1 };
}

/** Records a version; the first call for a project also records the film it started from. */
export async function record(projectId: string, film: FilmState, label: string, before?: FilmState): Promise<History> {
  let h = await loadHistory(projectId);
  if (!h.versions.length && before) h = pushVersion(h, { at: new Date().toISOString(), label: "original", film: before });
  return save(projectId, pushVersion(h, { at: new Date().toISOString(), label, film }));
}

/** Moves to an earlier (-1) or later (+1) version; returns it and the history, or null at either end. */
export async function step(projectId: string, by: -1 | 1): Promise<{ history: History; film: FilmState } | null> {
  const h = await loadHistory(projectId);
  const index = h.index + by;
  if (index < 0 || index >= h.versions.length) return null;
  const next = await save(projectId, { ...h, index });
  return { history: next, film: next.versions[index].film };
}

export async function dropHistory(projectId: string): Promise<void> {
  memory.delete(projectId);
  await run("readwrite", (s) => s.delete(projectId));
}
