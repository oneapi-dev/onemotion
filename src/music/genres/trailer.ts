import { human, noiseInto, swellInto } from "./common";
import type { GenreSpec, Note } from "./types";

/**
 * Trailer: a low pad and sparse Steinway notes (0), a plucked ostinato and
 * low toms (1), orchestral bass drum and a tom groove (2), braams on every
 * bar and rolling toms (3). Card landings hit with the bass drum and a sub
 * drop; build-ups swell a cymbal and accelerate the toms.
 */

// Ostinato shapes over the chord: indexes into [root, third, fifth, octave].
const OSTINATI = [
  [0, 2, 3, 2, 0, 2, 3, 2],
  [0, 1, 2, 1, 3, 2, 1, 2],
  [3, 2, 0, 2, 3, 2, 1, 2],
];

export const trailer: GenreSpec = {
  bpm: [84, 100],
  keys: [
    { key: "D", mode: "minor" },
    { key: "C", mode: "minor" },
    { key: "E", mode: "minor" },
    { key: "A", mode: "minor" },
    { key: "F", mode: "minor" },
  ],
  allowed: {
    minor: ["i", "isus2", "iv", "v", "V", "VI", "III", "VII", "ii°", "isus4"],
    major: ["I", "IV", "V", "vi", "bVI", "bVII", "Isus2", "Isus4", "iii"],
  },
  progressions: {
    minor: [
      ["i", "VI", "III", "VII"],
      ["i", "VI", "iv", "V"],
      ["i", "III", "VII", "VI"],
      ["i", "i", "VI", "VII"],
    ],
    major: [
      ["I", "bVI", "bVII", "I"],
      ["vi", "IV", "I", "V"],
    ],
  },
  register: { low: 48, high: 67, voices: 4, bass: 26 },
  sidechain: false,

  bar({ start, beats, energy, voicing, bass, chord, rng, first }) {
    const notes: Note[] = [];
    const at = (b: number) => b < beats - 1e-6;
    for (const n of voicing) notes.push({ inst: "pad", beat: start, beats, note: n - 12, vel: energy === 0 ? 0.45 : 0.3 });
    notes.push({ inst: "pad", beat: start, beats, note: bass + 12, vel: 0.35 });
    if (energy === 0) {
      for (let b = 0; at(b); b += 2) {
        const tone = voicing[Math.floor(rng() * voicing.length)] + 12;
        notes.push({ inst: "piano", beat: start + b, beats: 2, note: tone, vel: human(0.42, rng, 0.2) });
      }
      if (first) notes.push({ inst: "piano", beat: start, beats: 4, note: bass + 12, vel: 0.5 });
    }
    if (energy >= 1) {
      const shape = OSTINATI[Math.floor(rng() * OSTINATI.length)];
      // Root, the chord's middle and top tones above it, then the octave: true to any chord quality.
      const above = (tone: number) => bass + 24 + ((tone - bass) % 12 + 12) % 12;
      const tones = [bass + 24, above(chord.tones[1] ?? chord.tones[0]), above(chord.tones[2] ?? chord.tones[0]), bass + 36];
      for (let i = 0; at(i * 0.5); i++) notes.push({ inst: "pluck", beat: start + i * 0.5, beats: 0.4, note: tones[shape[i % 8]], vel: human(energy >= 2 ? 0.6 : 0.45, rng) });
      notes.push({ inst: "tom", sample: "low", beat: start, vel: human(0.55, rng) });
    }
    if (energy >= 2) {
      for (const b of [0, 2.5]) if (at(b)) notes.push({ inst: "boom", sample: "f", beat: start + b, vel: human(0.75, rng) });
      for (const b of [1, 1.5, 3, 3.5]) if (at(b)) notes.push({ inst: "tom", sample: b % 1 ? "high" : "low", beat: start + b, vel: human(0.55, rng) });
      if (at(3)) notes.push({ inst: "snare", sample: "rope", beat: start + 3, vel: human(0.5, rng) });
    }
    if (energy === 3) {
      for (const n of voicing) notes.push({ inst: "braam", beat: start, beats: Math.min(beats, 3.5), note: n - 12, vel: 0.6 });
      for (let b = 0; at(b); b += 0.5) notes.push({ inst: "tom", sample: b % 1 ? "high" : "low", beat: start + b, vel: human(0.42, rng) });
      if (first) notes.push({ inst: "crash", sample: "2", beat: start, vel: 0.7 });
    }
    return notes;
  },

  landing({ beat, energy, drop, voicing, bass }) {
    const notes: Note[] = [
      { inst: "boom", sample: "ff", beat, vel: drop ? 1 : 0.7 + energy * 0.08 },
      { inst: "sub", beat, note: bass - 12, beats: 3, vel: drop ? 1 : 0.7 },
    ];
    if (drop || energy >= 2) notes.push({ inst: "crash", sample: "2", beat, vel: drop ? 0.9 : 0.6 });
    if (drop) {
      for (const n of voicing) notes.push({ inst: "braam", beat, beats: 3, note: n - 12, vel: 0.8 });
      notes.push({ inst: "piano", beat, beats: 4, note: bass, vel: 0.85 });
    }
    return notes;
  },

  riser(ctx) {
    const notes: Note[] = [...swellInto(ctx, 0.8), ...noiseInto(ctx, 0.25)];
    // Toms accelerating into the hit: quarters, then 8ths, then 16ths.
    const from = Math.max(ctx.from, ctx.to - 4);
    for (let b = from; b < ctx.to - 1e-6; ) {
      const left = ctx.to - b;
      notes.push({ inst: "tom", sample: left > 1 ? "low" : "high", beat: b, vel: 0.35 + 0.5 * (1 - left / (ctx.to - from)) });
      b += left > 2 ? 1 : left > 1 ? 0.5 : 0.25;
    }
    return notes;
  },

  ending({ beat, beats, voicing, bass }) {
    const hold = Math.max(2, beats);
    return [
      { inst: "boom", sample: "ff", beat, vel: 1 },
      { inst: "sub", beat, note: bass - 12, beats: 4, vel: 1 },
      { inst: "crash", sample: "2", beat, vel: 0.9 },
      ...voicing.map((n): Note => ({ inst: "braam", beat, beats: Math.min(hold, 4), note: n - 12, vel: 0.85 })),
      { inst: "piano", beat, beats: hold, note: bass, vel: 0.9 },
      { inst: "piano", beat, beats: hold, note: bass + 12, vel: 0.75 },
      ...voicing.map((n): Note => ({ inst: "pad", beat, beats: hold, note: n - 12, vel: 0.4 })),
    ];
  },
};
