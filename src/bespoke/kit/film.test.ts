import { describe, expect, it } from "vitest";
import { cueProblem } from "./cue";
import { makeCue, type Beat } from "./film";

const beats = [
  { id: "b1", start: 0, end: 90, words: [] },
  { id: "b2", start: 90, end: 180, words: [{ text: "gratis", at: 120 }] },
] as unknown as Beat[];
const cue = makeCue(beats, 180, 30);

describe("cue()", () => {
  it("reads the forms models write with a colon as the offsets they mean", () => {
    expect(cue("b2:+0.8")).toBe(cue("b2+0.8"));
    expect(cue("b2:+0.8")).toBe(114);
    expect(cue("b2:-0.5")).toBe(75);
    expect(cue("b2:@0.5")).toBe(135);
    expect(cue("b2:end")).toBe(180);
  });

  it("still reads words, and still throws on what it cannot read", () => {
    expect(cue("b2:gratis")).toBe(120);
    expect(cue("b2:gratis+0.2")).toBe(126);
    expect(() => cue("b2 + later")).toThrow(/use "b3"/);
    expect(() => cue("b9")).toThrow(/no beat "b9"/);
  });
});

describe("cueProblem", () => {
  it("passes every form the kit reads and names one it cannot", () => {
    for (const ok of ["b3", "b3:gratis", "b3:satu integrasi#2", "b3+0.4", "b3:+0.4", "b3.end", "b3:end", "b3@0.5", "b3:@0.5", "end"]) expect(cueProblem(ok)).toBeNull();
    expect(cueProblem("b3 + later")).toMatch(/cannot be read/);
  });
});
