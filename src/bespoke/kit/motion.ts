// Motion math for bespoke scenes. Adapted from remotion-opus-skill's kit
// (MIT, (c) 2026 direkturcrypto): every value is a pure function of the frame.
import { Easing } from "remotion";

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
/** Fast out, long settle: the default for things arriving. */
export const outE = Easing.bezier(0.16, 1, 0.3, 1);
/** Symmetric ease for moves between two rests. */
export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
/** Slow start, slow stop, fast middle: camera flights and whip moves. */
export const flyE = Easing.bezier(0.8, 0, 0.2, 1);
export const lin = (x: number) => x;

/** Eased 0 to 1 progress of frame t between frames a and b. */
export const prog = (t: number, a: number, b: number, e: (x: number) => number = outE) => e(clamp01((t - a) / (b - a || 1)));

/** A springy 0 to 1 with overshoot, starting at frame t0 (0 before it). Larger k settles slower. */
export const pop = (t: number, t0: number, k = 4) => (t < t0 ? 0 : 1 - Math.exp(-(t - t0) / k) * Math.cos((t - t0) * 0.45));

/** A punch envelope: eases in over `rise` frames before `at`, decays after. Never a one-frame step. */
export const hitEnv = (t: number, at: number, decay = 8, rise = 6) => (t < at ? prog(t, at - rise, at, inOut) : Math.exp(-(t - at) / decay));

/** Deterministic 0..1 noise for an index: use it wherever you would reach for Math.random. */
export const seeded = (n: number) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

export type KP = [number, number, ((x: number) => number)?];
/** Keyframes [frame, value, ease?]; a key's ease shapes the segment that ends on it (default inOut). */
export const kf = (t: number, pts: KP[]) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    const [f1, v1, e] = pts[i];
    const [f0, v0] = pts[i - 1];
    if (t <= f1) return v0 + (v1 - v0) * (e ?? inOut)(clamp01((t - f0) / (f1 - f0 || 1)));
  }
  return pts[pts.length - 1][1];
};

/** The first characters of s typed by frame t, starting at `at`, `cps` characters per frame. */
export const typed = (s: string, t: number, at: number, cps = 1.4) => s.slice(0, Math.max(0, Math.min(s.length, Math.floor((t - at) * cps))));

/** Linear map of v from [a, b] to [c, d], clamped. */
export const remap = (v: number, a: number, b: number, c: number, d: number) => c + (d - c) * clamp01((v - a) / (b - a || 1));

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;

// Craft curves and envelopes. Values from Emil Kowalski's "animate" skill (MIT), the
// "anatomy" skill by wheresryan22 (MIT) and pbakaus's impeccable "animate" (Apache-2.0),
// rewritten as pure functions of the frame.

/** Arrivals of UI and type: quick out, long settle (Emil Kowalski's ease-out). */
export const arriveE = Easing.bezier(0.23, 1, 0.32, 1);
/** Moves and morphs between two rests on screen. */
export const moveE = Easing.bezier(0.77, 0, 0.175, 1);
/** Panels, sheets and drawers sliding in. */
export const panelE = Easing.bezier(0.32, 0.72, 0, 1);

/** A critically damped 0 to 1 from frame `at`, settled in about `dur` frames: no overshoot (colour, brightness, the size of text). */
export const settle = (t: number, at: number, dur = 18) => {
  if (t <= at) return 0;
  const x = ((t - at) / dur) * 6;
  return 1 - (1 + x) * Math.exp(-x);
};

/**
 * An event's envelope: rises over `rise` frames (never a one-frame jump),
 * peaks at 1 and decays with time constant `fall`. Overlapping events add.
 */
export const burst = (t: number, at: number, rise = 3, fall = 8) => {
  const age = t - at;
  if (age <= 0) return 0;
  const up = clamp01(age / rise);
  return up * up * (3 - 2 * up) * (age > rise ? Math.exp(-(age - rise) / fall) : 1);
};

/** Spring settings that land with a hint of weight (damping ratio about 0.8): Remotion's default (damping 10) is visibly bouncy. */
export const weighty = { damping: 16, stiffness: 100, mass: 1 } as const;

/** The start frame of item `i` of a list revealed one after another, `step` frames apart, the whole spread capped at `cap` frames. */
export const stagger = (at: number, i: number, n: number, step = 2, cap = 18) => at + i * Math.min(step, n > 1 ? cap / (n - 1) : step);

/** A clip-path that wipes an element in from `from` ("top" reveals downward) between frames `at` and `at + dur`. */
export const wipeIn = (t: number, at: number, dur = 16, from: "top" | "bottom" | "left" | "right" = "bottom") => {
  const hide = (1 - prog(t, at, at + dur, moveE)) * 100;
  const sides = { top: `0 0 ${hide}% 0`, bottom: `${hide}% 0 0 0`, left: `0 ${hide}% 0 0`, right: `0 0 0 ${hide}%` };
  return `inset(${sides[from]})`;
};
