import { describe, expect, it } from "vitest";
import { makeCue } from "./kit/film";
import { FILM_FPS, VOICE_LEAD, filmTiming, type FilmBeat } from "./timing";

const beats: FilmBeat[] = [
  { id: "b1", says: "One key.", shows: "", seconds: 2, voice: "One key, every model.", words: [{ text: "One", start: 0, end: 0.2 }, { text: "key,", start: 0.25, end: 0.5 }, { text: "every", start: 0.6, end: 0.8 }, { text: "model.", start: 0.85, end: 1.2 }], voiceSeconds: 1.3 },
  { id: "b2", says: "Self-hosted or cloud, one key.", shows: "", seconds: 2 },
  { id: "b3", says: "oneapi.id", shows: "", seconds: 3 },
];

describe("filmTiming", () => {
  it("places recorded words after the voice lead, and estimates the rest inside their beat", () => {
    const { beats: b } = filmTiming(beats, { bpm: 120 });
    expect(b[0].spoken).toBe(true);
    expect(b[0].words[1]).toEqual({ text: "key,", at: Math.round(VOICE_LEAD * FILM_FPS + 0.25 * FILM_FPS), end: Math.round(VOICE_LEAD * FILM_FPS + 0.5 * FILM_FPS) });
    expect(b[1].spoken).toBe(false);
    for (const w of b[1].words) {
      expect(w.at).toBeGreaterThanOrEqual(b[1].start);
      expect(w.end).toBeLessThanOrEqual(b[1].end);
    }
  });
});

describe("makeCue", () => {
  const { beats: b, timing } = filmTiming(beats, { bpm: 120 });
  const cue = makeCue(b, timing.total, FILM_FPS);

  it("finds a spoken word, ignoring case and punctuation, with offsets", () => {
    expect(cue("b1:key")).toBe(b[0].words[1].at);
    expect(cue("b1:KEY+0.5")).toBe(b[0].words[1].at + 15);
    expect(cue("b2:self-hosted")).toBe(b[1].words[0].at);
    expect(cue("b2:one")).toBe(b[1].words[3].at);
  });

  it("keeps the beat forms", () => {
    expect(cue("b2")).toBe(b[1].start);
    expect(cue("b2.end")).toBe(b[1].end);
    expect(cue("b2@0.5")).toBe(Math.round((b[1].start + b[1].end) / 2));
    expect(cue("end")).toBe(timing.total - 1);
  });

  it("says what a beat does say when a word is not in it", () => {
    expect(() => cue("b1:gateway")).toThrow(/does not say "gateway".*One key, every model\./);
    expect(() => cue("b9")).toThrow(/no beat "b9"/);
  });
});
