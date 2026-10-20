import { describe, expect, it } from "vitest";
import { captionChunks } from "./Captions";

const words = (s: string) => s.split(" ").map((text, i) => ({ text, at: i * 10, end: i * 10 + 8 }));

describe("captionChunks", () => {
  it("keeps a short line as one phrase", () => {
    expect(captionChunks(words("One key, every model.")).map((c) => c.length)).toEqual([4]);
  });

  it("reads a long narration a phrase at a time, breaking after clauses, never losing a word", () => {
    const line = "OneMotion turns one sentence into a launch film. The art director invents the look, the designer writes the code, and your browser renders the video in minutes.";
    const chunks = captionChunks(words(line));
    expect(chunks.flat().map((w) => w.text).join(" ")).toBe(line);
    for (const c of chunks) {
      expect(c.length).toBeLessThanOrEqual(8);
      expect(c.map((w) => w.text).join(" ").length).toBeLessThanOrEqual(50);
    }
    expect(chunks[0].map((w) => w.text).join(" ")).toBe("OneMotion turns one sentence into a launch");
    expect(chunks.length).toBeGreaterThanOrEqual(4);
  });
});
