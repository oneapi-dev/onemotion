import { describe, expect, it } from "vitest";
import type { Plan } from "../engine/plan";
import { planTiming } from "../engine/rig";
import { arrange } from "./arrange";
import { SAMPLES } from "./samples";
import { presetScore, type Score } from "./score";
import { chordOf } from "./theory";

const scenes = (n: number) => Array.from({ length: n }, (_, i) => ({ type: i === n - 1 ? ("cta" as const) : ("statement" as const), duration: 3.2, title: "x" }));
const planWith = (score: Score): Plan => ({
  angle: "test",
  archetype: "promo",
  brand: "T",
  look: "midnight",
  path: "dolly",
  tone: "punchy",
  caption: "",
  fonts: { display: "Inter", body: "Inter" },
  music: "drive",
  score,
  scenes: scenes(score.chords.length),
});

const PITCHED = new Set(["piano", "pad", "braam", "pluck", "bass"]);

for (const genre of ["house", "trailer"] as const) {
  describe(`arrange (${genre})`, () => {
    const score = presetScore(genre, 6, 11);
    const plan = planWith(score);
    const timing = planTiming(plan);
    const song = arrange(score, timing);
    const secondsOf = (beat: number) => (beat * 60) / score.bpm;

    it("fills the video and nothing past it", () => {
      expect(song.seconds).toBeCloseTo(timing.total / 30, 5);
      for (const e of song.events) {
        expect(e.time).toBeGreaterThanOrEqual(-1e-9);
        expect(e.time).toBeLessThan(song.seconds);
      }
    });

    it("hits on every card landing", () => {
      for (const beat of timing.startBeats) {
        const t = secondsOf(beat);
        const hits = song.events.filter((e) => Math.abs(e.time - t) < 1e-6 && ["crash", "boom", "kick", "sub"].includes(e.inst));
        expect(hits.length).toBeGreaterThan(0);
      }
    });

    it("plays only the notes of the chord sounding at the time", () => {
      for (const e of song.events) {
        if (!PITCHED.has(e.inst) || e.note === undefined) continue;
        const scene = timing.startBeats.findLastIndex((b) => secondsOf(b) <= e.time + 1e-9);
        const tones = score.chords[scene].flatMap((c) => chordOf(c, score.key, score.mode)!.tones);
        expect(tones).toContain(e.note % 12);
      }
    });

    it("lands each swell's peak on its card", () => {
      for (const e of song.events.filter((x) => x.inst === "swell")) {
        const peak = e.time + SAMPLES.swell[e.sample as "2s" | "4s"].peak;
        expect(timing.startBeats.some((b) => Math.abs(secondsOf(b) - peak) < 1e-6)).toBe(true);
      }
    });

    it("never plays the same sound twice at once", () => {
      const keys = song.events.map((e) => `${e.time.toFixed(6)}|${e.inst}|${e.note ?? ""}|${e.sample ?? ""}`);
      expect(new Set(keys).size).toBe(keys.length);
    });

    it("is the same every time for the same score", () => {
      expect(arrange(score, timing)).toEqual(song);
    });
  });
}

describe("arrange moments", () => {
  const base = presetScore("house", 5, 3);
  const at = (score: Score) => {
    const timing = planTiming(planWith(score));
    return { timing, song: arrange(score, timing), sec: (b: number) => (b * 60) / score.bpm };
  };

  it("keeps energy 0 free of drums", () => {
    const { timing, song, sec } = at({ ...base, energy: [0, 0, 0, 0, 0], moments: [] });
    const end = sec(timing.startBeats[4]);
    const drums = song.events.filter((e) => e.time > 1e-6 && e.time < end - 1e-6 && ["kick", "clap", "hat", "openhat", "snare"].includes(e.inst));
    expect(drums).toEqual([]);
  });

  it("drops: a beat of silence before the card, then the hit", () => {
    const { timing, song, sec } = at({ ...base, energy: [2, 2, 2, 2, 2], moments: [{ scene: 2, kind: "drop" }] });
    const land = sec(timing.startBeats[2]);
    const before = song.events.filter((e) => e.time >= sec(timing.startBeats[2] - 1) - 1e-6 && e.time < land - 1e-6);
    expect(before).toEqual([]);
    expect(song.events.some((e) => Math.abs(e.time - land) < 1e-6 && e.inst === "crash")).toBe(true);
  });

  it("stops: only the hit sounds in the card's first bar", () => {
    const { timing, song, sec } = at({ ...base, energy: [2, 2, 2, 2, 2], moments: [{ scene: 2, kind: "stop" }] });
    const land = sec(timing.startBeats[2]);
    const bar = sec(timing.startBeats[2] + 4);
    const inside = song.events.filter((e) => e.time > land + 1e-6 && e.time < bar - 1e-6);
    expect(inside).toEqual([]);
  });

  it("builds up into a riser's card", () => {
    const { timing, song, sec } = at({ ...base, moments: [{ scene: 3, kind: "riser" }] });
    const land = sec(timing.startBeats[3]);
    expect(song.events.some((e) => e.inst === "noise" && e.time < land && Math.abs(e.time + e.duration - land) < 1e-6)).toBe(true);
  });
});
