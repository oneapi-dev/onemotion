/**
 * Just enough music theory for the composer: keys, roman-numeral chords and
 * voice leading. Pitches are MIDI numbers (60 = C4); pitch classes are 0-11.
 */

export const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;
export type PitchClass = (typeof PITCH_CLASSES)[number];
export type Mode = "major" | "minor";

const SCALES: Record<Mode, number[]> = { major: [0, 2, 4, 5, 7, 9, 11], minor: [0, 2, 3, 5, 7, 8, 10] };
const NUMERALS = ["I", "II", "III", "IV", "V", "VI", "VII"];

export type Chord = { roman: string; root: number; tones: number[] };

const pc = (n: number) => ((n % 12) + 12) % 12;
export const keyPc = (key: PitchClass) => PITCH_CLASSES.indexOf(key);

/** The pitch classes of a key's scale. */
export const scaleOf = (key: PitchClass, mode: Mode) => SCALES[mode].map((s) => pc(keyPc(key) + s));

/**
 * A roman numeral in a key: the degree counts along the key's own scale
 * (in A minor, VI is F), an optional b or # moves the root, the case sets
 * major or minor, then ° (diminished), + (augmented), sus2, sus4, 7 or maj7.
 */
export function chordOf(roman: string, key: PitchClass, mode: Mode): Chord | null {
  const m = /^([b#]?)(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|o|dim|\+)?(maj7|7|sus2|sus4)?$/.exec(roman.trim());
  if (!m) return null;
  const [, accidental, numeral, quality, extra] = m;
  const degree = NUMERALS.indexOf(numeral.toUpperCase());
  const root = pc(keyPc(key) + SCALES[mode][degree] + (accidental === "b" ? -1 : accidental === "#" ? 1 : 0));
  const minor = numeral === numeral.toLowerCase();
  let intervals = quality === "°" || quality === "o" || quality === "dim" ? [0, 3, 6] : quality === "+" ? [0, 4, 8] : minor ? [0, 3, 7] : [0, 4, 7];
  if (extra === "sus2") intervals = [0, 2, 7];
  if (extra === "sus4") intervals = [0, 5, 7];
  if (extra === "7") intervals = [...intervals, intervals[1] === 3 && intervals[2] === 6 ? 9 : 10];
  if (extra === "maj7") intervals = [...intervals, 11];
  return { roman, root, tones: intervals.map((i) => pc(root + i)) };
}

/**
 * Voices a chord as `count` notes inside [low, high]: every tone present,
 * only the root or fifth doubled, spread within a twelfth, and each voice as
 * close as it can stay to the previous chord's (or centered in the register
 * when there is none).
 */
export function voice(chord: Chord, prev: number[] | null, low: number, high: number, count: number): number[] {
  const pool: number[] = [];
  for (let n = low; n <= high; n++) if (chord.tones.includes(pc(n))) pool.push(n);
  const fifth = pc(chord.root + 7);
  const required = chord.tones.slice(0, Math.min(count, chord.tones.length));
  let best: number[] | null = null;
  let bestCost = Infinity;
  const pick = (from: number, chosen: number[]) => {
    if (chosen.length === count) {
      const pcs = chosen.map(pc);
      if (!required.every((t) => pcs.includes(t))) return;
      const doubled = pcs.filter((p, i) => pcs.indexOf(p) !== i);
      if (doubled.some((p) => p !== chord.root && p !== fifth)) return;
      if (chosen[count - 1] - chosen[0] > 19) return;
      const cost = prev && prev.length === count ? chosen.reduce((s, n, i) => s + Math.abs(n - prev[i]), 0) : Math.abs(chosen.reduce((s, n) => s + n, 0) / count - (low + high) / 2);
      const spread = (chosen[count - 1] - chosen[0]) / 100;
      if (cost + spread < bestCost) [best, bestCost] = [[...chosen], cost + spread];
      return;
    }
    for (let i = from; i < pool.length; i++) pick(i + 1, [...chosen, pool[i]]);
  };
  pick(0, []);
  // A register too narrow for every tone: fall back to the root stacked in octaves.
  return best ?? Array.from({ length: count }, (_, i) => low + pc(chord.root - low) + 12 * (i % 2));
}

/** The chord's root in the octave starting at `low`. */
export const bassNote = (chord: Chord, low: number) => low + pc(chord.root - low);

/** A MIDI note as Tone.js names it: 61 is "C#4". */
export const midiName = (n: number) => `${PITCH_CLASSES[pc(n)]}${Math.floor(n / 12) - 1}`;
