import { SAMPLES } from "../samples";
import type { Note, RiserContext } from "./types";

/** Beats in a stretch of seconds at a tempo. */
export const beatsIn = (seconds: number, bpm: number) => (seconds * bpm) / 60;

/**
 * A cymbal swell timed so its loudest moment lands on `to`: the longest one
 * that fits in the build-up, started early by its own peak time.
 */
export function swellInto(ctx: RiserContext, vel = 0.75): Note[] {
  const room = ctx.to - ctx.from;
  for (const name of ["4s", "2s"] as const) {
    const lead = beatsIn(SAMPLES.swell[name].peak, ctx.bpm);
    if (lead <= room + 0.01) return [{ inst: "swell", sample: name, beat: ctx.to - lead, vel }];
  }
  return [];
}

/** A snare roll tightening from 8ths to 16ths to 32nds into `to`, louder as it goes. */
export function snareRollInto(ctx: RiserContext, beats = 2, vel = 0.6): Note[] {
  const from = Math.max(ctx.from, ctx.to - beats);
  const notes: Note[] = [];
  for (let b = from; b < ctx.to - 1e-6; ) {
    const left = ctx.to - b;
    const step = left > 1 ? 0.5 : left > 0.5 ? 0.25 : 0.125;
    notes.push({ inst: "snare", sample: "tight", beat: b, vel: vel * (0.45 + 0.55 * (1 - left / (ctx.to - from))) });
    b += step;
  }
  return notes;
}

/** A filtered noise sweep rising over the build-up. */
export const noiseInto = (ctx: RiserContext, vel = 0.35): Note[] => [{ inst: "noise", beat: ctx.from, beats: ctx.to - ctx.from, vel }];

/** Velocity with a little human variation. */
export const human = (vel: number, rng: () => number, amount = 0.08) => Math.max(0.05, Math.min(1, vel * (1 - amount / 2 + rng() * amount)));
