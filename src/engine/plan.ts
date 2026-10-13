/**
 * The plan: everything a video is, as data. The director (src/director)
 * writes and validates it; the engine draws any valid plan. Change both
 * together.
 */

import type { Score } from "../music/score";

export type Tone = "punchy" | "polished" | "cinematic" | "playful" | "deadpan" | "energetic" | "clean";

export type Music = "drive" | "bright" | "calm" | "pulse" | "epic";

/** The room and how its cards are built. */
export type LookName = "midnight" | "graphite" | "paper" | "sage" | "mono" | "ember";

/** The camera's route between cards. */
export type CameraPath = "dolly" | "serpentine" | "staircase";

export type SceneType =
  | "hook"
  | "logo"
  | "statement"
  | "screenshot"
  | "device"
  | "features"
  | "steps"
  | "converge"
  | "stat"
  | "quote"
  | "offer"
  | "cta"
  | "announce"
  | "chat"
  | "code"
  | "checklist"
  | "bars"
  | "compare"
  | "kinetic"
  | "specs";

export type Archetype =
  | "promo"
  | "launch"
  | "announcement"
  | "explainer"
  | "tutorial"
  | "problem-solution"
  | "versus"
  | "reasons"
  | "one-number";

export type PlanItem = {
  title: string;
  body?: string;
  /** bars: the bar the video is about. */
  highlight?: boolean;
};

export type PlanScene = {
  type: SceneType;
  /** Seconds. */
  duration: number;
  eyebrow?: string;
  title?: string;
  body?: string;
  value?: string;
  /** compare: the two column labels. */
  left?: string;
  right?: string;
  items?: PlanItem[];
  /** Index into the video's screenshots. */
  shot?: number;
  motion?: "scroll" | "zoom" | "pan";
  /** The voiceover line spoken over this scene, in the plan's language, numbers as on screen. */
  narration?: string;
  /** How long the recorded line runs, once a voice has read it: the scene holds at least that long. */
  narration_seconds?: number;
};

export type Plan = {
  angle: string;
  archetype: Archetype;
  /** The name the video is about. */
  brand: string;
  /** The brand's own color, read from its website; replaces the look's accent. */
  brand_color?: string;
  look: LookName;
  path: CameraPath;
  tone: Tone;
  caption: string;
  /** The language the plan is written and narrated in (ISO 639-1, e.g. "id", "en"). */
  language?: string;
  fonts: { display: string; body: string };
  /** The bed a plan was made with before scores existed; it picks the genre when `score` is missing. */
  music: Music;
  /** The music, composed for this video (src/music/score.ts). Checked before it plays. */
  score?: Score;
  scenes: PlanScene[];
};

export type MotionFormat = "landscape" | "portrait" | "square";

export type ShotKind = "hero" | "section" | "strip" | "mobile";

/** What the composition receives: the plan plus loadable brand and screenshots. */
export type VideoInput = {
  plan: Plan;
  format: MotionFormat;
  brand: { name: string; domain: string; logo_src: string | null };
  shots: { src: string | null; kind: ShotKind; width: number; height: number }[];
  /** Recorded voiceover lines by scene index, as URLs this page can play (blob: URLs from the browser's store). */
  voiceover?: Record<number, string>;
};

export const FPS = 30;

export const DIMENSIONS: Record<MotionFormat, { width: number; height: number }> = {
  landscape: { width: 1920, height: 1080 },
  portrait: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};
