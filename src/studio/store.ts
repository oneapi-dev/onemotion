"use client";

import type { FilmState } from "@/bespoke/agent/run";
import type { SiteInfo } from "@/director/input";
import type { MotionFormat, Plan, Tone } from "@/engine/plan";
import type { VoiceChoice } from "@/voice/narrate";

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
  /** A template video: the director's plan. */
  plan?: Plan;
  /** A bespoke video: its concept and the scene the model wrote. */
  film?: FilmState;
  /** The voice that read this video's narration, when it has one. */
  voice?: VoiceChoice;
};

/** Optional voiceover with the person's own ElevenLabs key. */
export type VoiceSettings = { on: boolean; key: string; voiceId: string; voiceName: string };

export type Settings = {
  key: string;
  model: string;
  voice?: VoiceSettings;
  /** Let the creative director and the lead search and read the web (OneAPI web search, billed per search). */
  webSearch?: boolean;
};

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
