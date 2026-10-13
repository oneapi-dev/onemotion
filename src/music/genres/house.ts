import { human, noiseInto, snareRollInto, swellInto } from "./common";
import type { GenreSpec, Note } from "./types";

/**
 * House: four on the floor, offbeat bass, Steinway piano stabs over a pad
 * that ducks under the kick. Energy adds hats and bass (1), the kick, claps
 * and stabs (2), then 16th hats, open hats and octave bass (3).
 */

// Classic house stab rhythms, in beats within the bar.
const STABS = [
  [0, 0.75, 1.5, 2.5, 3.25],
  [0.5, 1.25, 2, 2.75, 3.5],
  [0, 1.5, 2.25, 3],
];

export const house: GenreSpec = {
  bpm: [120, 126],
  keys: [
    { key: "A", mode: "minor" },
    { key: "F", mode: "minor" },
    { key: "C", mode: "minor" },
    { key: "D", mode: "minor" },
    { key: "G", mode: "major" },
    { key: "F", mode: "major" },
  ],
  allowed: {
    minor: ["i", "i7", "iv", "iv7", "v", "v7", "V", "V7", "VI", "VImaj7", "III", "IIImaj7", "VII", "VII7", "ii°", "isus4", "VIIsus4"],
    major: ["I", "Imaj7", "ii", "ii7", "iii", "iii7", "IV", "IVmaj7", "V", "V7", "Vsus4", "vi", "vi7", "bVII", "bVI"],
  },
  progressions: {
    minor: [
      ["i", "VI", "III", "VII"],
      ["i", "VII", "VI", "VII"],
      ["i", "iv7", "VII", "IIImaj7"],
      ["VImaj7", "VII", "i", "i"],
    ],
    major: [
      ["I", "V", "vi", "IV"],
      ["IVmaj7", "V", "iii7", "vi7"],
      ["vi", "IV", "I", "V"],
    ],
  },
  register: { low: 55, high: 76, voices: 4, bass: 33 },
  sidechain: true,

  bar({ start, beats, energy, voicing, bass, rng }) {
    const notes: Note[] = [];
    const at = (b: number) => b < beats - 1e-6;
    for (const n of voicing) notes.push({ inst: "pad", beat: start, beats, note: n, vel: energy === 0 ? 0.5 : 0.32 });
    if (energy >= 1) {
      for (let b = 0.5; at(b); b += 1) notes.push({ inst: "hat", sample: rng() < 0.5 ? "closed1" : "closed2", beat: start + b, vel: human(0.5, rng) });
      for (let b = 0.5; at(b); b += 1) notes.push({ inst: "bass", beat: start + b, beats: 0.4, note: bass + (energy === 3 && b === 2.5 ? 12 : 0), vel: human(0.8, rng) });
    }
    if (energy >= 2) {
      for (let b = 0; at(b); b += 1) notes.push({ inst: "kick", beat: start + b, vel: 0.95 });
      for (const b of [1, 3]) if (at(b)) notes.push({ inst: "clap", sample: String(1 + Math.floor(rng() * 3)), beat: start + b, vel: human(0.75, rng) });
      const rhythm = STABS[Math.floor(rng() * STABS.length)];
      for (const b of rhythm) if (at(b)) for (const n of voicing) notes.push({ inst: "piano", beat: start + b, beats: 0.4, note: n + 12, vel: human(0.62, rng) });
    }
    if (energy === 3) {
      for (let b = 0; at(b); b += 0.25) if (b % 0.5 !== 0) notes.push({ inst: "hat", sample: "closed2", beat: start + b, vel: human(0.28, rng) });
      for (let b = 0.5; at(b); b += 1) notes.push({ inst: "openhat", sample: "open", beat: start + b, vel: human(0.32, rng) });
    }
    return notes;
  },

  landing({ beat, energy, drop, voicing, bass }) {
    const notes: Note[] = [];
    if (drop || energy >= 2) notes.push({ inst: "crash", sample: drop ? "2" : "1", beat, vel: drop ? 0.85 : 0.32 });
    if (drop || energy >= 1) notes.push({ inst: "kick", beat, vel: drop ? 1 : 0.85 });
    if (drop) notes.push({ inst: "sub", beat, note: bass - 12, beats: 2, vel: 0.8 });
    if (drop) for (const n of voicing) notes.push({ inst: "piano", beat, beats: 1.5, note: n + 12, vel: 0.8 });
    return notes;
  },

  riser(ctx) {
    return [...swellInto(ctx, 0.7), ...noiseInto(ctx, 0.3), ...(ctx.energy >= 1 ? snareRollInto(ctx, Math.min(4, ctx.to - ctx.from), 0.55) : [])];
  },

  ending({ beat, beats, voicing, bass }) {
    const hold = Math.max(2, beats);
    return [
      { inst: "crash", sample: "2", beat, vel: 0.55 },
      { inst: "kick", beat, vel: 0.9 },
      { inst: "sub", beat, note: bass - 12, beats: 1.5, vel: 0.4 },
      ...voicing.map((n): Note => ({ inst: "piano", beat, beats: hold, note: n + 12, vel: 0.75 })),
      { inst: "piano", beat, beats: hold, note: bass + 12, vel: 0.7 },
      ...voicing.map((n): Note => ({ inst: "pad", beat, beats: hold, note: n, vel: 0.4 })),
    ];
  },
};
