import type { Timing } from "../engine/rig";
import { specOf } from "./genres";
import type { Energy, Inst, Note } from "./genres/types";
import { rngOf } from "./rng";
import type { Score } from "./score";
import { bassNote, chordOf, voice, type Chord } from "./theory";

/** One sound to render, in seconds from the start of the video. */
export type SongEvent = { time: number; inst: Inst; vel: number; duration: number; note?: number; sample?: string };

export type Song = { bpm: number; seconds: number; sidechain: boolean; events: SongEvent[] };

/**
 * Turns a score into the notes of a song built on the video's own timeline.
 * Pure: no audio, and the same score and timing always give the same song.
 *
 * Each scene is a section. Its card lands on the section's first beat with
 * the genre's hit; its bars play the scene's chords, one per bar, at the
 * scene's energy; the close plays the genre's ending and rings out. Moments
 * then reshape the edges: a riser builds into its card, a drop silences the
 * beat before it, a stop silences its first bar after the hit.
 */
export function arrange(score: Score, timing: Timing): Song {
  const spec = specOf(score.genre);
  const rng = rngOf(score.seed ^ 0x9e3779b9);
  const seconds = timing.total / 30;
  const sec = (beat: number) => (beat * 60) / score.bpm;
  const n = timing.startBeats.length;
  const notes: Note[] = [];
  const silent: [number, number][] = [];
  let last: number[] | null = null;

  const harmony = (chord: Chord) => {
    const voicing = voice(chord, last, spec.register.low, spec.register.high, spec.register.voices);
    last = voicing;
    return { chord, voicing, bass: bassNote(chord, spec.register.bass) };
  };

  for (let i = 0; i < n; i++) {
    const start = timing.startBeats[i];
    const end = start + timing.beats[i];
    const kind = score.moments.find((m) => m.scene === i)?.kind;
    const energy: Energy = kind === "drop" ? 3 : (score.energy[i] ?? 2);
    const chords = score.chords[i].map((c) => chordOf(c, score.key, score.mode)).filter((c): c is Chord => c !== null);
    const opening = harmony(chords[0]);

    if (kind === "riser" && i > 0) {
      const from = start - Math.min(8, timing.beats[i - 1]);
      notes.push(...spec.riser({ from, to: start, energy, bpm: score.bpm, rng }));
    }
    if (kind === "drop") silent.push([start - 1, start]);
    if (i === n - 1) {
      notes.push(...spec.ending({ beat: start, beats: end - start, ...opening }));
      continue;
    }
    notes.push(...spec.landing({ beat: start, energy, drop: kind === "drop", rng, ...opening }));
    for (let b = start, k = 0; b < end - 1e-9; b += 4, k++) {
      const h = k === 0 ? opening : harmony(chords[k % chords.length]);
      notes.push(...spec.bar({ start: b, beats: Math.min(4, end - b), energy, first: k === 0, last: b + 4 >= end - 1e-9, rng, ...h }));
    }
    if (kind === "stop") silent.push([start + 1e-6, Math.min(end, start + 4)]);
  }

  const quiet = (beat: number) => silent.some(([a, b]) => beat >= a - 1e-9 && beat < b - 1e-9);
  // A landing and its scene's first bar can both strike the same sound on the
  // same beat; it sounds once, at the louder velocity and the longer length.
  const once = new Map<string, Note>();
  for (const x of notes) {
    const key = `${x.beat.toFixed(6)}|${x.inst}|${x.note ?? ""}|${x.sample ?? ""}`;
    const had = once.get(key);
    once.set(key, had ? { ...had, vel: Math.max(had.vel, x.vel), beats: Math.max(had.beats ?? 0, x.beats ?? 0) || undefined } : x);
  }
  const events = [...once.values()]
    .filter((x) => !quiet(x.beat))
    .map((x): SongEvent => {
      const time = sec(x.beat);
      const e: SongEvent = { time, inst: x.inst, vel: x.vel, duration: Math.min(sec(x.beats ?? 0), seconds - time) };
      if (x.note !== undefined) e.note = x.note;
      if (x.sample !== undefined) e.sample = x.sample;
      return e;
    })
    .filter((e) => e.time >= 0 && e.time < seconds)
    .sort((a, b) => a.time - b.time || a.inst.localeCompare(b.inst) || (a.note ?? 0) - (b.note ?? 0));
  return { bpm: score.bpm, seconds, sidechain: spec.sidechain, events };
}
