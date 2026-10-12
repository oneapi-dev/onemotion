import { describe, expect, it } from "vitest";
import { specOf } from "./genres";
import { normalizeScore, presetScore, scoreOf } from "./score";
import { chordOf } from "./theory";

describe("presetScore", () => {
  it("gives every scene chords the genre allows, a tempo in range and an energy", () => {
    for (const genre of ["house", "trailer"] as const) {
      const s = presetScore(genre, 6, 7);
      const spec = specOf(genre);
      expect(s.bpm).toBeGreaterThanOrEqual(spec.bpm[0]);
      expect(s.bpm).toBeLessThanOrEqual(spec.bpm[1]);
      expect(s.chords).toHaveLength(6);
      expect(s.energy).toHaveLength(6);
      for (const scene of s.chords) for (const c of scene) expect(spec.allowed[s.mode]).toContain(c);
      expect(s.moments.some((m) => m.kind === "riser" && m.scene === 5)).toBe(true);
    }
  });
});

describe("normalizeScore", () => {
  it("keeps a well-formed score", () => {
    const raw = { genre: "trailer", bpm: 92, key: "D", mode: "minor", chords: [["i", "VI"], ["III", "VII"]], energy: [1, 3], moments: [{ scene: 1, kind: "drop" }], seed: 4 };
    expect(normalizeScore(raw, 2, "house", 1)).toEqual(raw);
  });

  it("repairs what a model gets wrong", () => {
    const s = normalizeScore(
      { genre: "dubstep", bpm: 300, key: "H", mode: "dorian", chords: [["i", "IX", "drop table"], "nope"], energy: [7, -1, "x"], moments: [{ scene: 0, kind: "drop" }, { scene: 9, kind: "stop" }, { scene: 1, kind: "explode" }] },
      3,
      "house",
      5,
    );
    expect(s.genre).toBe("house");
    expect(s.bpm).toBe(126);
    expect(s.key).toBe(presetScore("house", 3, 5).key);
    expect(s.mode).toBe(presetScore("house", 3, 5).mode);
    expect(s.chords).toHaveLength(3);
    for (const scene of s.chords) {
      expect(scene.length).toBeGreaterThan(0);
      for (const c of scene) expect(chordOf(c, s.key, s.mode)).not.toBeNull();
    }
    expect(s.energy).toEqual([3, 0, presetScore("house", 3, 5).energy[2]]);
    expect(s.moments).toEqual([]);
    expect(Number.isInteger(s.seed)).toBe(true);
  });

  it("drops chords the genre does not allow and keeps one moment per scene", () => {
    const s = normalizeScore({ genre: "house", mode: "minor", key: "A", chords: [["i", "bII", "VI"]], moments: [{ scene: 1, kind: "drop" }, { scene: 1, kind: "stop" }] }, 2, "house", 1);
    expect(s.chords[0]).toEqual(["i", "VI"]);
    expect(s.moments).toEqual([{ scene: 1, kind: "drop" }]);
  });
});

describe("scoreOf", () => {
  it("scores a plan saved before scores existed from its music bed", () => {
    const plan = { angle: "a", music: "epic", scenes: [{}, {}, {}] } as never;
    expect(scoreOf(plan).genre).toBe("trailer");
    expect(scoreOf(plan)).toEqual(scoreOf(plan));
  });
});
