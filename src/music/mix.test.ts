import { describe, expect, it } from "vitest";
import { defaultLevel, matchGain, rmsDb, TARGET_RMS_DB } from "./mix";

describe("the music mix", () => {
  it("keeps the music a bed: quieter under a voice-over than alone, both well under full", () => {
    expect(defaultLevel(true)).toBeLessThan(defaultLevel(false));
    expect(20 * Math.log10(defaultLevel(true))).toBeLessThan(-9);
    expect(20 * Math.log10(defaultLevel(false))).toBeLessThan(-6);
  });

  it("measures a track's level and brings a loud master down to the library's", () => {
    // A full-scale sine is -3 dBFS RMS: a loudly mastered track.
    const loud = Float32Array.from({ length: 44100 }, (_, i) => Math.sin((i / 44100) * 2 * Math.PI * 220));
    expect(rmsDb([loud])).toBeCloseTo(-3, 0);
    const g = matchGain(rmsDb([loud]));
    expect(20 * Math.log10(g)).toBeCloseTo(TARGET_RMS_DB + 3, 0);
    // A very quiet track is lifted, but never by more than 2.5x.
    expect(matchGain(-60)).toBe(2.5);
    expect(matchGain(-Infinity)).toBe(1);
  });
});
