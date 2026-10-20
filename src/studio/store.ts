"use client";

import type { ClientEndpoint } from "@/bespoke/agent/llm";
import type { FilmState } from "@/bespoke/agent/run";
import type { CatalogModel, SiteInfo } from "@/director/input";
import type { MotionFormat, Plan, Tone } from "@/engine/plan";
import type { VoiceTuning } from "@/voice/eleven";
import type { VoiceChoice } from "@/voice/narrate";
import { DEFAULT_PRONUNCIATIONS, mergeLexicons, type Pronunciation } from "@/voice/spoken";
import type { Partner } from "./briefs";

/**
 * Everything is kept in this browser: the OneAPI key, the chosen model and
 * the videos made here. Nothing is stored on a server. Storage can be
 * missing (private windows, blocked site data); every read and write
 * tolerates that and the app keeps working for the session.
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
export type VoiceSettings = { on: boolean; key: string; voiceId: string; voiceName: string; tuning?: VoiceTuning };

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
  /** Where a film's music comes from: a built-in library track (rotated so videos differ), or ElevenLabs Music made for each film. */
  music?: "library" | "elevenlabs";
  /** The export profile (src/studio/renderTarget.ts): output size, bitrate, encoder preference. */
  renderProfile?: "eco" | "balanced" | "quality" | "max";
  /** How names, domains and acronyms are said in every video; unset means the defaults. */
  pronunciations?: Pronunciation[];
  /** The model a step goes to when the chosen one keeps failing: unset picks one automatically, "none" turns it off. */
  backupModel?: string;
};

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
const KEEP = 12;

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

export const loadSettings = (): Settings => read<Settings>(SETTINGS, { key: "", model: "" });
export const saveSettings = (s: Settings) => write(SETTINGS, s);

export const loadProjects = (): Project[] => read<Project[]>(PROJECTS, []);

/**
 * No build survives a closed app: a film still marked "building" when the
 * studio opens was interrupted. It keeps everything built until then
 * (saved after every step) and is marked so the person can continue it.
 */
export const recoverInterrupted = (list: Project[]): Project[] => list.map((p) => (p.film?.status === "building" ? { ...p, film: { ...p.film, status: "stopped" as const, interrupted: true } } : p));

/** Saves a project first in the list; the oldest beyond twelve are dropped. */
export function saveProject(p: Project): Project[] {
  const list = [p, ...loadProjects().filter((x) => x.id !== p.id)].slice(0, KEEP);
  // A full storage quota drops the oldest projects until the list fits.
  for (let n = list.length; n > 0; n--) if (write(PROJECTS, list.slice(0, n))) return list.slice(0, n);
  return list;
}

export function deleteProject(id: string): Project[] {
  const list = loadProjects().filter((x) => x.id !== id);
  write(PROJECTS, list);
  return list;
}

export const newId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);
