import type { Chord, Mode, PitchClass } from "../theory";

/** 0: pad and texture; 1: + bass and hats; 2: + full drums; 3: + lead or brass, deeper sidechain. */
export type Energy = 0 | 1 | 2 | 3;

/** What can sound. Sampled instruments name a file in SAMPLES; the rest are synthesized. */
export type Inst =
  | "kick"
  | "sub"
  | "clap"
  | "hat"
  | "openhat"
  | "snare"
  | "roll"
  | "crash"
  | "swell"
  | "boom"
  | "tom"
  | "bass"
  | "piano"
  | "pad"
  | "braam"
  | "pluck"
  | "noise";

/**
 * One sound in the arrangement, in beats from the start of the video.
 * `note` is a MIDI pitch for pitched instruments; `sample` picks a file of a
 * sampled one (a clap, the 4 s swell); `beats` is how long it holds.
 */
export type Note = { inst: Inst; beat: number; vel: number; note?: number; beats?: number; sample?: string };

type Harmony = { chord: Chord; voicing: number[]; bass: number };

export type BarContext = Harmony & {
  /** The bar's first beat; `beats` is 4, or less when its scene ends sooner. */
  start: number;
  beats: number;
  energy: Energy;
  /** First and last bar of its scene. */
  first: boolean;
  last: boolean;
  rng: () => number;
};

export type LandingContext = Harmony & { beat: number; energy: Energy; drop: boolean; rng: () => number };
export type RiserContext = { from: number; to: number; energy: Energy; bpm: number; rng: () => number };
export type EndingContext = Harmony & { beat: number; beats: number };

/** A genre: its musical ground rules and how it plays a bar, a card landing, a build-up and the close. */
export type GenreSpec = {
  bpm: [number, number];
  /** Keys it sounds right in; a score's key outside these is still allowed. */
  keys: { key: PitchClass; mode: Mode }[];
  /** Chords a score may use, by mode. */
  allowed: Record<Mode, string[]>;
  progressions: Record<Mode, string[][]>;
  /** Chord voicing: MIDI range and how many notes; the bass plays from `bass` up an octave. */
  register: { low: number; high: number; voices: number; bass: number };
  /** Pad and bass duck under each kick. */
  sidechain: boolean;
  bar(ctx: BarContext): Note[];
  landing(ctx: LandingContext): Note[];
  riser(ctx: RiserContext): Note[];
  ending(ctx: EndingContext): Note[];
};
