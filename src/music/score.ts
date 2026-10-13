import type { Music, Plan } from "../engine/plan";
import { isGenre, specOf, type Genre } from "./genres";
import type { Energy, GenreSpec } from "./genres/types";
import { hashOf, rngOf } from "./rng";
import { PITCH_CLASSES, chordOf, type Mode, type PitchClass } from "./theory";

export type { Energy } from "./genres/types";
export { GENRES, type Genre } from "./genres";

export type MomentKind = "drop" | "stop" | "riser";
export type Moment = { scene: number; kind: MomentKind };

/**
 * What the director writes for the music: the genre, tempo and key, a chord
 * progression and an energy per scene, and up to three special moments
 * (`drop`: a beat of silence then everything; `stop`: the music cuts on the
 * card and returns on the next bar; `riser`: a build-up into the card).
 */
export type Score = {
  genre: Genre;
  bpm: number;
  key: PitchClass;
  mode: Mode;
  chords: string[][];
  energy: Energy[];
  moments: Moment[];
  seed: number;
};

const KINDS: MomentKind[] = ["drop", "stop", "riser"];
const MAX_CHORDS = 8;
const MAX_MOMENTS = 3;

/** Plans made before scores existed name a music bed; each maps to the genre closest to it. */
export const LEGACY_GENRE: Record<Music, Genre> = { drive: "corporate-pop", bright: "future-bass", calm: "ambient-tech", pulse: "house", epic: "trailer" };

/** A scene's chords when the score gives none: the seed's progression, rotated so scenes differ. */
function progressionFor(spec: GenreSpec, mode: Mode, scene: number, seed: number): string[] {
  const list = spec.progressions[mode];
  const p = list[seed % list.length];
  const turn = scene % p.length;
  return [...p.slice(turn), ...p.slice(0, turn)];
}

/** A bed that stays under the picture: quiet in, steady through the middle, a step up for the close. */
function defaultEnergy(scenes: number): Energy[] {
  return Array.from({ length: scenes }, (_, i): Energy => (i === 0 ? 1 : i === scenes - 1 ? 2 : i % 3 === 2 ? 2 : 1));
}

/** A complete, genre-true score for a number of scenes, varied by the seed. */
export function presetScore(genre: Genre, scenes: number, seed: number): Score {
  const spec = specOf(genre);
  const rnd = rngOf(seed);
  const { key, mode } = spec.keys[Math.floor(rnd() * spec.keys.length)];
  const [lo, hi] = spec.bpm;
  const bpm = Math.round(lo + rnd() * (hi - lo));
  // Moments are the director's to give where the story turns; a preset has none.
  const moments: Moment[] = [];
  return {
    genre,
    bpm,
    key,
    mode,
    chords: Array.from({ length: scenes }, (_, i) => progressionFor(spec, mode, i, seed)),
    energy: defaultEnergy(scenes),
    moments,
    seed,
  };
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Checks a score from the director against the plan's scene count and the
 * genre's rules. What is wrong is replaced, never left to break the music:
 * an unknown genre by `fallback`, a tempo by the nearest the genre allows,
 * chords outside the genre by its own progression.
 */
export function normalizeScore(raw: unknown, scenes: number, fallback: Genre, seed: number): Score {
  const r = isRecord(raw) ? raw : {};
  const genre = isGenre(r.genre) ? r.genre : fallback;
  const s = typeof r.seed === "number" && Number.isFinite(r.seed) ? Math.abs(Math.round(r.seed)) : seed;
  const preset = presetScore(genre, scenes, s);
  const spec = specOf(genre);
  const bpm = typeof r.bpm === "number" && Number.isFinite(r.bpm) ? Math.round(Math.min(spec.bpm[1], Math.max(spec.bpm[0], r.bpm))) : preset.bpm;
  const key = (PITCH_CLASSES as readonly unknown[]).includes(r.key) ? (r.key as PitchClass) : preset.key;
  const mode: Mode = r.mode === "major" || r.mode === "minor" ? r.mode : preset.mode;
  const rawChords = Array.isArray(r.chords) ? r.chords : [];
  const chords = Array.from({ length: scenes }, (_, i) => {
    const given = Array.isArray(rawChords[i]) ? (rawChords[i] as unknown[]) : [];
    const ok = given.filter((c): c is string => typeof c === "string" && spec.allowed[mode].includes(c) && chordOf(c, key, mode) !== null).slice(0, MAX_CHORDS);
    return ok.length ? ok : progressionFor(spec, mode, i, s);
  });
  const rawEnergy = Array.isArray(r.energy) ? r.energy : [];
  const energy = preset.energy.map((e, i): Energy => {
    const v = rawEnergy[i];
    return typeof v === "number" && Number.isFinite(v) ? (Math.min(3, Math.max(0, Math.round(v))) as Energy) : e;
  });
  const moments: Moment[] = [];
  if (Array.isArray(r.moments)) {
    for (const m of r.moments) {
      if (!isRecord(m) || typeof m.scene !== "number" || !KINDS.includes(m.kind as MomentKind)) continue;
      const scene = Math.round(m.scene);
      // The first card has nothing before it to drop, stop or build from.
      if (scene < 1 || scene >= scenes || moments.some((x) => x.scene === scene)) continue;
      moments.push({ scene, kind: m.kind as MomentKind });
      if (moments.length === MAX_MOMENTS) break;
    }
  }
  return { genre, bpm, key, mode, chords, energy, moments, seed: s };
}

/** The score a plan plays: its own, checked, or one composed from the music bed it was made with. */
export function scoreOf(plan: Pick<Plan, "angle" | "music" | "scenes"> & { score?: unknown }): Score {
  const n = Math.max(1, plan.scenes.length);
  const fallback = LEGACY_GENRE[plan.music] ?? "corporate-pop";
  const seed = hashOf(`${plan.angle}|${n}`);
  return plan.score === undefined ? presetScore(fallback, n, seed) : normalizeScore(plan.score, n, fallback, seed);
}
