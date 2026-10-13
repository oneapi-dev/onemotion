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
