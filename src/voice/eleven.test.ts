import { describe, expect, it } from "vitest";
import { wordsOf } from "./eleven";

describe("wordsOf", () => {
  it("groups aligned characters into timed words", () => {
    const chars = [..."Satu kunci."];
    const starts = chars.map((_, i) => i * 0.1);
    const ends = chars.map((_, i) => i * 0.1 + 0.08);
    expect(wordsOf({ characters: chars, character_start_times_seconds: starts, character_end_times_seconds: ends })).toEqual([
      { text: "Satu", start: 0, end: 0.38 },
      { text: "kunci.", start: 0.5, end: 1.08 },
    ]);
  });
});
