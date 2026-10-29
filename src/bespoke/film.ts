import type { MusicMap } from "../music/analyze";
import type { Score } from "../music/score";
import type { Brand, Partner } from "./kit/film";
import type { FilmBeat } from "./timing";

export type FilmFormat = "landscape" | "portrait" | "square";

/** Everything about a bespoke film except its code: the beats, the brand and the music. */
export type FilmSpec = {
  format: FilmFormat;
  beats: FilmBeat[];
  brand: Brand;
  /** The second brand of a collaboration film. */
  partner?: Partner;
  score: Score;
  /** A built-in music track (src/music/library.ts) to play instead of the composed score; the score's tempo is the track's. */
  track?: string;
  /**
   * More built-in tracks after the first, each taking over at the start of a beat (a calm problem, then
   * the product kicking in): the new track's downbeat lands on that beat, crossfaded over half a bar.
   */
  cues?: { track: string; from: string }[];
  /** Real images the agents fetched (logos, icons), by name, as data URLs. "name@light" is a one-colour logo repainted white for dark backgrounds, "name@dark" one repainted dark. */
  assets?: Record<string, string>;
  /** Where each asset came from (address -> name), so the same image is never fetched twice. */
  assetSources?: Record<string, string>;
  /** The art style every illustration of this film shares, fixed by the first one made (src/bespoke/agent/imageTool.ts). */
  imageStyle?: string;
  /** A person's own track, as read when it was added: its tempo, downbeat and drops. */
  musicMap?: MusicMap;
  /** The mix: the music's level (0 to 1; src/music/mix.ts when unset), no music at all, and the gain that matched a person's own track to the library's loudness. */
  mix?: { music?: number; off?: boolean; trim?: number };
  /** False hides the voice-over captions (narration in another language than the words on screen). */
  captions?: boolean;
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
