import type { Score } from "../music/score";
import type { Brand } from "./kit/film";
import type { FilmBeat } from "./timing";

export type FilmFormat = "landscape" | "portrait" | "square";

/** Everything about a bespoke film except its code: the beats, the brand and the music. */
export type FilmSpec = {
  format: FilmFormat;
  beats: FilmBeat[];
  brand: Brand;
  score: Score;
  /** A built-in music track (src/music/library.ts) to play instead of the composed score; the score's tempo is the track's. */
  track?: string;
  /** Real images the agents fetched (logos, icons), by name, as data URLs. "name@light" is a one-colour logo repainted white for dark backgrounds, "name@dark" one repainted dark. */
  assets?: Record<string, string>;
  /** Where each asset came from (address -> name), so the same image is never fetched twice. */
  assetSources?: Record<string, string>;
};

/** What the film host renders: the spec, the scene compiled to CommonJS modules by path, and recorded voice lines by beat index. */
export type FilmInput = {
  spec: FilmSpec;
  modules: Record<string, string>;
  voiceover?: Record<number, string>;
  /** A finished music bed to play instead of composing one. */
  music?: string;
  /** A still rendered for the model: run the automated QA on it. */
  qa?: boolean;
};

/** The module every scene starts from. */
export const SCENE_ENTRY = "scene/index.tsx";
