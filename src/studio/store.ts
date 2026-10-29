"use client";

import type { ImageConfig } from "@/bespoke/agent/imageTool";
import type { ClientEndpoint } from "@/bespoke/agent/llm";
import type { FilmState } from "@/bespoke/agent/run";
import type { CatalogModel, SiteInfo } from "@/director/input";
import type { MotionFormat, Plan, Tone } from "@/engine/plan";
import type { VoiceTuning } from "@/voice/eleven";
import type { VoiceChoice } from "@/voice/narrate";
import { DEFAULT_PRONUNCIATIONS, mergeLexicons, type Pronunciation } from "@/voice/spoken";
import type { Partner } from "./briefs";

/**
 * What the person keeps: the OneAPI key, the chosen model and the videos made.
 * On their own computer (the desktop app, `npm start`) the studio's local
 * server keeps them in files, one data folder shared by every way of opening
 * the studio (src/server/dataDir.ts); anywhere else, or when that server
 * refuses, they stay in this browser's localStorage and nothing is stored on
 * a server. Storage can be missing (private windows, blocked site data);
 * every read and write tolerates that and the app keeps working for the
 * session.
 *
 * The reads stay synchronous: `hydrate()` loads the folder once, before the
 * studio reads anything, and writes go to memory at once and to the folder a
 * moment later.
 */

export type Project = {
  id: string;
  createdAt: string;
  brief: string;
  website: string;
  format: MotionFormat;
  tone: Tone | "auto";
  site: SiteInfo | null;
  /** A collaboration video's partner: what was asked for, and what its website gave (with an uploaded logo over its own). */
  partner?: Omit<Partner, "logo"> & { site: SiteInfo | null };
  /** A template video: the director's plan. */
  plan?: Plan;
  /** A bespoke video: its concept and the scene the model wrote. */
  film?: FilmState;
  /** The voice that read this video's narration, when it has one. */
  voice?: VoiceChoice;
  /** This video's own pronunciations, over the studio's. */
  pronunciations?: Pronunciation[];
};

/** Optional voiceover with the person's own ElevenLabs key. */
export type VoiceSettings = { on: boolean; key: string; voiceId: string; voiceName: string; tuning?: VoiceTuning; /** The language the narration is written and spoken in; unset follows the video's own language. */ language?: string };

/** The person's own OpenAI-compatible or Anthropic-compatible endpoint, as found by Settings. */
export type CustomEndpoint = ClientEndpoint & { key: string; model: string; models: string[] };

export type Settings = {
  /** The OneAPI key and model. */
  key: string;
  model: string;
  /** Which AI the studio uses: OneAPI (the default) or the person's own endpoint. */
  provider?: "oneapi" | "custom";
  custom?: CustomEndpoint;
  voice?: VoiceSettings;
  /** Let the creative director and the lead search and read the web (OneAPI web search, billed per search). */
  webSearch?: boolean;
  /** Build bespoke films with a team of agents in parallel (faster, less coherent) instead of one designer. */
  team?: boolean;
  /** Where a film's music comes from: a built-in library track (rotated so videos differ), or music made for each film by ElevenLabs Music or Stable Audio. */
  music?: "library" | "elevenlabs" | "stableaudio";
  /** The person's stableaudio.com login token, for Stable Audio music (it expires after a few hours). */
  stableAudio?: { token: string };
  /** The export profile (src/studio/renderTarget.ts): output size, bitrate, encoder preference. */
  renderProfile?: "eco" | "balanced" | "quality" | "max";
  /** How names, domains and acronyms are said in every video; unset means the defaults. */
  pronunciations?: Pronunciation[];
  /** The model a step goes to when the chosen one keeps failing: unset picks one automatically, "none" turns it off. */
  backupModel?: string;
  /** Illustrations in bespoke films, from the person's image endpoint. */
  images?: ImageSettings;
};

/** The person's image endpoint: an OpenAI-compatible /images/generations and /images/edits (e.g. NaraRouter's). */
export type ImageSettings = { on: boolean; base: string; key: string; model: string; quality: ImageConfig["quality"] };

export const IMAGE_DEFAULTS: ImageSettings = { on: false, base: "https://api-images.bynara.id/v1", key: "", model: "gpt-image-2", quality: "medium" };

/** The image endpoint a film is made with, or null when it is off or not set up. */
export function imagesOf(s: Pick<Settings, "images">): ImageConfig | null {
  const i = s.images;
  return i?.on && /^https?:\/\//i.test(i.base) && i.key && i.model ? { base: i.base.trim(), key: i.key, model: i.model.trim(), quality: i.quality } : null;
}

/**
 * The backup model for a chosen one: the person's pick, none, or (by
 * default) the catalog model closest in price that can also read images
 * and work as an agent, so a fallback never costs much more.
 */
export function backupOf(s: Pick<Settings, "backupModel">, model: string, catalog: CatalogModel[]): string | null {
  if (s.backupModel === "none") return null;
  if (s.backupModel && s.backupModel !== model) return s.backupModel;
  const price = (m: CatalogModel) => Number(m.inputPrice) + Number(m.outputPrice) || 0;
  const main = catalog.find((m) => m.id === model);
  // Capabilities compared without case: the catalog has written "VIsion".
  const can = (m: CatalogModel, c: string) => m.capabilities.some((x) => x.toLowerCase() === c);
  const able = catalog.filter((m) => m.id !== model && can(m, "vision") && can(m, "chat") && price(m) > 0);
  if (!main || !able.length) return null;
  const target = price(main) || 1;
  const near = (m: CatalogModel) => Math.abs(Math.log(price(m) / target));
  return [...able].sort((a, b) => near(a) - near(b) || price(a) - price(b))[0].id;
}

/** The studio's pronunciations: the person's, or the defaults until they change them. */
export const studioLexicon = (s: Settings): Pronunciation[] => s.pronunciations ?? DEFAULT_PRONUNCIATIONS;

/** What a project's narration is read with: its own pronunciations first, then the studio's. */
export const lexiconOf = (s: Settings, p?: Pick<Project, "pronunciations"> | null): Pronunciation[] => mergeLexicons(p?.pronunciations, studioLexicon(s));

/** The AI the studio uses now: its key, model and endpoint (null for OneAPI), and its name. */
export function aiOf(s: Settings): { key: string; model: string; endpoint: ClientEndpoint | null; name: string; custom: boolean } {
  const c = s.custom;
  if (s.provider === "custom" && c) {
    let name = "your endpoint";
    try {
      name = new URL(c.base).host;
    } catch {
      // A base URL that is not a URL yet: Settings says so.
    }
    return { key: c.key, model: c.model, endpoint: { base: c.base, api: c.api, auth: c.auth }, name, custom: true };
  }
  return { key: s.key, model: s.model, endpoint: null, name: "OneAPI", custom: false };
}

/** Voiceover is wanted and can be recorded. */
export const voiceReady = (s: Settings): s is Settings & { voice: VoiceSettings } => Boolean(s.voice?.on && s.voice.key && s.voice.voiceId);

const PROJECTS = "oneapi-motion:projects";
const SETTINGS = "oneapi-motion:settings";
/** Set once this browser's old localStorage data has been copied into the data folder. */
const MOVED = "oneapi-motion:moved-to-folder";
/** Without a folder the browser keeps this many projects; a folder keeps them all. */
const KEEP = 12;
const STORE_HEADERS = { "x-onemotion-store": "1" };

type Pending = { upsert: Map<string, Project>; remove: Set<string>; settings: Settings | null };

/** The folder's contents, once loaded; null while the browser's own storage is in use. */
let cache: { projects: Project[]; settings: Settings } | null = null;
let folder: string | null = null;
let failure: string | null = null;
let hydrating: Promise<void> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
let pending: Pending = { upsert: new Map(), remove: new Set(), settings: null };

/** Where things are kept now, and the last save that failed (it is retried). */
export const storageInfo = () => ({ folder, error: failure });

const schedule = (ms = 300) => {
  clearTimeout(timer);
  timer = setTimeout(() => void flush(), ms);
};

/** Sends what changed since the last save to the folder; a failure keeps it for the next try. */
export async function flush(): Promise<void> {
  clearTimeout(timer);
  const batch = pending;
  if (!cache || (!batch.upsert.size && !batch.remove.size && !batch.settings)) return;
  pending = { upsert: new Map(), remove: new Set(), settings: null };
  try {
    const res = await fetch("/api/store", {
      method: "PUT",
      headers: { ...STORE_HEADERS, "Content-Type": "application/json" },
      body: JSON.stringify({ upsert: [...batch.upsert.values()], remove: [...batch.remove], ...(batch.settings ? { settings: batch.settings } : {}) }),
    });
    if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `The studio's server answered ${res.status}.`);
    failure = null;
  } catch (err) {
    // Anything saved again meanwhile is newer than what failed.
    for (const [id, p] of batch.upsert) if (!pending.upsert.has(id) && !pending.remove.has(id)) pending.upsert.set(id, p);
    for (const id of batch.remove) if (!pending.upsert.has(id)) pending.remove.add(id);
    pending.settings ??= batch.settings;
    failure = err instanceof Error ? err.message : "Could not save to the data folder.";
    schedule(3000);
  }
}

/**
 * Loads the data folder (once) and, the first time, copies in what this
 * browser kept before: projects the folder lacks are added, and the old
 * settings are used if the folder has none yet. When the server does not
 * offer a folder, the browser's own storage carries on.
 */
export function hydrate(): Promise<void> {
  return (hydrating ??= (async () => {
    try {
      const res = await fetch("/api/store", { headers: STORE_HEADERS, cache: "no-store" });
      if (!res.ok) return;
      const body = (await res.json()) as { root: string; projects: Project[]; settings: Settings | null };
      let { projects, settings } = body;
      if (!read<boolean>(MOVED, false)) {
        const have = new Set(projects.map((p) => p.id));
        const old = read<Project[]>(PROJECTS, []).filter((p) => p && typeof p.id === "string" && !have.has(p.id));
        const oldSettings = read<Settings | null>(SETTINGS, null);
        const adopt = !settings && oldSettings ? oldSettings : null;
        if (old.length || adopt) {
          const put = await fetch("/api/store", { method: "PUT", headers: { ...STORE_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ upsert: old, ...(adopt ? { settings: adopt } : {}) }) });
          if (!put.ok) return;
        }
        projects = [...projects, ...old];
        settings = adopt ?? settings;
        write(MOVED, true);
      }
      cache = { projects, settings: settings ?? { key: "", model: "" } };
      folder = body.root;
      if (typeof window !== "undefined") {
        const out = () => void flush();
        window.addEventListener("pagehide", out);
        document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && out());
      }
    } catch {
      // No local server to keep files: the browser's storage carries on.
    }
  })());
}

/** Moves to another data folder (saving first), then the page should reload to read it. */
export async function changeFolder(dir: string, copy: boolean): Promise<{ root: string; copied: number }> {
  await flush();
  const res = await fetch("/api/store/location", { method: "POST", headers: { ...STORE_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify({ dir, copy }) });
  const body = (await res.json().catch(() => null)) as { root?: string; copied?: number; error?: string } | null;
  if (!res.ok || !body?.root) throw new Error(body?.error ?? "Could not use that folder.");
  return { root: body.root, copied: body.copied ?? 0 };
}

function read<T>(name: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(name);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(name: string, value: unknown): boolean {
  try {
    window.localStorage.setItem(name, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const loadSettings = (): Settings => cache?.settings ?? read<Settings>(SETTINGS, { key: "", model: "" });
export function saveSettings(s: Settings): boolean {
  if (!cache) return write(SETTINGS, s);
  cache.settings = s;
  pending.settings = s;
  schedule();
  return true;
}

export const loadProjects = (): Project[] => cache?.projects ?? read<Project[]>(PROJECTS, []);

/**
 * No build survives a closed app: a film still marked "building" when the
 * studio opens was interrupted. It keeps everything built until then
 * (saved after every step) and is marked so the person can continue it.
 */
export const recoverInterrupted = (list: Project[]): Project[] => list.map((p) => (p.film?.status === "building" ? { ...p, film: { ...p.film, status: "stopped" as const, interrupted: true } } : p));

/** Saves a project first in the list; in the browser's storage the oldest beyond twelve are dropped. */
export function saveProject(p: Project): Project[] {
  if (cache) {
    cache.projects = [p, ...cache.projects.filter((x) => x.id !== p.id)];
    pending.remove.delete(p.id);
    pending.upsert.set(p.id, p);
    schedule();
    return cache.projects;
  }
  const list = [p, ...loadProjects().filter((x) => x.id !== p.id)].slice(0, KEEP);
  // A full storage quota drops the oldest projects until the list fits.
  for (let n = list.length; n > 0; n--) if (write(PROJECTS, list.slice(0, n))) return list.slice(0, n);
  return list;
}

export function deleteProject(id: string): Project[] {
  if (cache) {
    cache.projects = cache.projects.filter((x) => x.id !== id);
    pending.upsert.delete(id);
    pending.remove.add(id);
    schedule();
    return cache.projects;
  }
  const list = loadProjects().filter((x) => x.id !== id);
  write(PROJECTS, list);
  return list;
}

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
