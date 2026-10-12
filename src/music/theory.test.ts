import { describe, expect, it } from "vitest";
import { bassNote, chordOf, midiName, voice } from "./theory";

const pcs = (notes: number[]) => [...new Set(notes.map((n) => n % 12))].sort((a, b) => a - b);

describe("chordOf", () => {
  it("reads diatonic numerals in a major key", () => {
    expect(chordOf("I", "C", "major")).toMatchObject({ root: 0, tones: [0, 4, 7] });
    expect(chordOf("vi", "C", "major")).toMatchObject({ root: 9, tones: [9, 0, 4] });
    expect(chordOf("V7", "G", "major")).toMatchObject({ root: 2, tones: [2, 6, 9, 0] });
    expect(chordOf("IVmaj7", "C", "major")).toMatchObject({ root: 5, tones: [5, 9, 0, 4] });
  });

  it("reads numerals in a minor key against the minor scale, with borrowed chords", () => {
    expect(chordOf("i", "A", "minor")).toMatchObject({ root: 9, tones: [9, 0, 4] });
    expect(chordOf("VI", "A", "minor")).toMatchObject({ root: 5, tones: [5, 9, 0] });
    expect(chordOf("V", "A", "minor")).toMatchObject({ root: 4, tones: [4, 8, 11] });
    expect(chordOf("bVII", "C", "major")).toMatchObject({ root: 10, tones: [10, 2, 5] });
    expect(chordOf("ii°", "A", "minor")).toMatchObject({ root: 11, tones: [11, 2, 5] });
    expect(chordOf("Isus4", "D", "major")).toMatchObject({ root: 2, tones: [2, 7, 9] });
  });

  it("rejects what is not a chord", () => {
    expect(chordOf("IX", "C", "major")).toBeNull();
    expect(chordOf("", "C", "major")).toBeNull();
    expect(chordOf("I; drop table", "C", "major")).toBeNull();
  });
});

describe("voice", () => {
  const C = chordOf("I", "C", "major")!;
  const F = chordOf("IV", "C", "major")!;
  const G = chordOf("V", "C", "major")!;

  it("plays only the chord's tones, inside the register", () => {
    for (const chord of [C, F, G]) {
      const v = voice(chord, null, 52, 76, 4);
      expect(v).toHaveLength(4);
      expect(pcs(v).every((p) => chord.tones.includes(p))).toBe(true);
      expect(Math.min(...v)).toBeGreaterThanOrEqual(52);
      expect(Math.max(...v)).toBeLessThanOrEqual(76);
    }
  });

  it("moves each voice as little as it can from the last chord", () => {
    const a = voice(C, null, 52, 76, 4);
    const b = voice(F, a, 52, 76, 4);
    const moved = a.map((n, i) => Math.abs(n - b[i])).reduce((x, y) => x + y, 0);
    // I to IV in close position keeps the common tone and steps the rest.
    expect(moved).toBeLessThanOrEqual(5);
  });
});

describe("bassNote and midiName", () => {
  it("puts the root in the bass octave and names notes for Tone", () => {
    expect(bassNote(chordOf("V", "A", "minor")!, 36)).toBe(40);
    expect(midiName(60)).toBe("C4");
    expect(midiName(61)).toBe("C#4");
    expect(midiName(33)).toBe("A1");
  });
});
