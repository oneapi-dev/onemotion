import { describe, expect, it } from "vitest";
import { flashes, frozenBeats, repeatedFigures, sameLayouts, samePrint, smallHero, type Print } from "./qa";

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

describe("composition", () => {
  const slide = { hero: { x: 0.3, y: 0.4, w: 0.4, h: 0.3 }, type: { x: 0.3, y: 0.15, w: 0.4, px: 90 } };
  const big = { hero: { x: 0.05, y: 0.1, w: 0.7, h: 0.8 }, type: { x: 0.6, y: 0.2, w: 0.35, px: 160 } };

  it("calls a frame with nothing big a slide, and passes a big hero or big type", () => {
    expect(smallHero(slide, 1080)).toMatch(/nothing on this frame is big: its largest panel spans 40 %/);
    expect(smallHero(big, 1080)).toBeNull();
    expect(smallHero({ hero: slide.hero, type: { ...slide.type, px: 170 } }, 1080)).toBeNull();
  });

  it("names the slide template when most beats stack a centred headline over a centred card", () => {
    const holds = ["b1", "b2", "b3", "b4"].map((beat, i) => ({ beat, frame: 50 + i * 100, layout: i === 3 ? big : slide }));
    expect(sameLayouts(holds)[0]).toMatch(/^frame 50: b1, b2, b3 are the same slide: a centred title across the top/);
    expect(sameLayouts(holds.map((h, i) => ({ ...h, layout: i % 2 ? big : slide })))).toEqual([]);
  });
});

describe("flashing", () => {
  const steady = (n: number, v = 120) => Array.from({ length: n }, (_, i) => ({ frame: i * 4, grid: Array(16).fill(v) }));

  it("flags a region flipping light and dark three times in a second, and passes a slow change", () => {
    const strobe = steady(16).map((s, i) => ({ ...s, grid: s.grid.map((v, r) => (r === 5 && i >= 4 && i < 12 ? (i % 2 ? 230 : 20) : v)) }));
    expect(flashes(strobe, 30, 4)[0]).toMatch(/^frames \d+ to \d+ flip between light and dark/);
    const fade = steady(16).map((s, i) => ({ ...s, grid: s.grid.map(() => 20 + i * 12) }));
    expect(flashes(fade, 30, 4)).toEqual([]);
  });
});
