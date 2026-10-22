import { describe, expect, it } from "vitest";
import { frozenBeats, repeatedFigures, samePrint, type Print } from "./qa";

/** A station's print: one headline and one bar, the bar `w` wide (a share of the station). */
const print = (w: number, words = "Harga turun."): Print => ({
  keys: [`H1|${words}|none|none|0px|rgba(0, 0, 0, 0)|rgb(0, 0, 0)`, "DIV||none|none|0px|rgb(37, 99, 235)|rgb(0, 0, 0)"],
  nums: [0.1, 0.1, 0.5, 0.1, 1, 0.1, 0.4, w, 0.02, 1],
});
const at = (entries: [number, Record<string, Print>][]) => new Map(entries.map(([f, p]) => [f, new Map(Object.entries(p))]));
const beats = [
  { id: "b1", start: 0, end: 150 },
  { id: "b2", start: 150, end: 300 },
  { id: "b3", start: 300, end: 450 },
];

describe("the freeze check", () => {
  it("calls a hair the same and a bar that grew, a new word or a new element different", () => {
    expect(samePrint(print(0.5), print(0.5 + 0.001))).toBe(true);
    expect(samePrint(print(0.5), print(0.6))).toBe(false);
    expect(samePrint(print(0.5), print(0.5, "Harga naik."))).toBe(false);
    expect(samePrint(print(0.5), { keys: [...print(0.5).keys, "SPAN|$0.19|none|none|0px|rgba(0, 0, 0, 0)|rgb(0, 0, 0)"], nums: [...print(0.5).nums, 0, 0, 0.1, 0.05, 1] })).toBe(false);
  });

  it("names the beats whose holds print the same, and leaves out the close", () => {
    const prints = at([
      [45, { b1: print(0.5) }],
      [98, { b1: print(0.5) }],
      [195, { b2: print(0.3) }],
      [248, { b2: print(0.7) }],
      [345, { b3: print(0.5) }],
      [398, { b3: print(0.5) }],
    ]);
    const [w, ...rest] = frozenBeats(beats, prints);
    expect(rest).toEqual([]);
    expect(w).toMatch(/^frame 98: the film freezes like slides: b1 \(frames 45 to 98, 1\.8 s\) holds perfectly still/);
    expect(w).not.toContain("b2");
    expect(w).not.toContain("b3");
  });

  it("needs the two stills far enough apart, and reads a film without a World by its whole frame", () => {
    expect(frozenBeats(beats, at([[80, { b1: print(0.5) }], [100, { b1: print(0.5) }]]))).toEqual([]);
    expect(frozenBeats(beats, at([[195, { "*": print(0.5) }], [248, { "*": print(0.5) }]]))[0]).toContain("b2 (frames 195 to 248");
  });
});

describe("figures said more than once in a frame", () => {
  it("counts the blocks that show a price or a model id, and lets two places pass", () => {
    const frame = ["FLASH CEPAT, INPUT $0.2.", "deepseek-v4.1-flash-1017-fast 0.97M Input $0.2", "NARAROUTER // GATEWAY — deepseek-v4.1-flash-1017-fast INPUT $0.2 / 1M", "> model=\"deepseek-v4.1-flash-1017-fast\""];
    expect(repeatedFigures(frame)).toEqual([
      ["$0.2", 3],
      ["deepseek-v4.1-flash-1017-fast", 3],
    ]);
    expect(repeatedFigures(["Input US$0.19", "now $0.19"])).toEqual([]);
  });
});
