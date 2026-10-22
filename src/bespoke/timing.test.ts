import { describe, expect, it } from "vitest";
import { cueMisses, makeCue } from "./kit/film";
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

  it("takes a phrase, at its first word where the whole phrase is said, and never throws on one", () => {
    expect(cue("b1:every model")).toBe(b[0].words[2].at);
    expect(cue("b1:key every+0.5")).toBe(b[0].words[1].at + 15);
    // "one key" is said in b2 after "cloud,": its "one" is the fourth word, not a phrase start elsewhere.
    expect(cue("b2:one key")).toBe(b[1].words[3].at);
    cueMisses.clear();
    expect(cue("b1:model every")).toBe(b[0].start);
    expect([...cueMisses][0]).toMatch(/does not say "model every"/);
  });

  it("keeps the beat forms", () => {
    expect(cue("b2")).toBe(b[1].start);
    expect(cue("b2.end")).toBe(b[1].end);
    expect(cue("b2@0.5")).toBe(Math.round((b[1].start + b[1].end) / 2));
    expect(cue("end")).toBe(timing.total - 1);
  });

  it("never stops the film on a word a beat does not say: it falls back to the beat's start and says so", () => {
    cueMisses.clear();
    expect(cue("b1:gateway")).toBe(cue("b1"));
    expect([...cueMisses][0]).toMatch(/does not say "gateway".*One key, every model\./);
    expect(() => cue("b9")).toThrow(/no beat "b9"/);
  });
});

describe("narration and transitions", () => {
  it("never ends a beat before its recorded line ends, at any tempo", () => {
    for (let bpm = 60; bpm <= 180; bpm += 7) {
      for (const voiceSeconds of [0.6, 1.1, 2.37, 3.1, 4.49, 7.9, 12.3]) {
        const list: FilmBeat[] = [
          { id: "b1", says: "a", shows: "", seconds: 1, voice: "a", voiceSeconds },
          { id: "b2", says: "b", shows: "", seconds: 1, voice: "b", voiceSeconds },
          { id: "b3", says: "c", shows: "", seconds: 1, voice: "c", voiceSeconds },
        ];
        const { timing } = filmTiming(list, { bpm });
        list.forEach((_, i) => {
          const lineEnd = timing.starts[i] + Math.ceil((VOICE_LEAD + voiceSeconds) * FILM_FPS);
          // The line is over, with a breath, before the next beat (and its transition) starts.
          expect(lineEnd + 3).toBeLessThanOrEqual(timing.starts[i] + timing.frames[i]);
        });
      }
    }
  });

  it("holds one continuous beat as long as the brief asks", () => {
    const { timing } = filmTiming([{ id: "b1", says: "one shot", shows: "", seconds: 45 }], { bpm: 100 });
    expect(timing.total / FILM_FPS).toBeGreaterThanOrEqual(45);
    expect(timing.total / FILM_FPS).toBeLessThan(46);
  });
});

describe("the music's ending", () => {
  it("ends every film on a bar line, so the last bar of music is whole", () => {
    for (const bpm of [90.5, 103.5, 115, 120, 123]) {
      for (const secs of [[3], [2.5, 3.1], [1.2, 2.2, 4.4, 3]]) {
        const { timing } = filmTiming(secs.map((s, i) => ({ id: `b${i + 1}`, says: "x", shows: "", seconds: s })), { bpm });
        expect(timing.beats.reduce((a, b) => a + b, 0) % 4).toBe(0);
      }
    }
  });
});

describe("a recorded line sets its beat's length", () => {
  it("cuts a beat the concept wanted longer down to its line and a breath", () => {
    const slow: FilmBeat[] = [
      { id: "b1", says: "Satu kunci.", shows: "", seconds: 7, voice: "Satu kunci.", voiceSeconds: 1.4 },
      { id: "b2", says: "router.bynara.id", shows: "", seconds: 4 },
    ];
    const { beats: t } = filmTiming(slow, { bpm: 120 });
    // 1.4 s spoken + 0.2 s lead + 0.3 s breath = 1.9 s, on the 0.5 s grid of 120 BPM: 2 s, not the 7 s the concept asked for.
    expect((t[0].end - t[0].start) / FILM_FPS).toBe(2);
  });
});
