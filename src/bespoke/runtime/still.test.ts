import { describe, expect, it } from "vitest";
import { parked, slideSheets, stillness } from "./qa";

// 100 pixels a sample; a moving sample's first 30 pixels take a new brightness every time, a still one's never change.
const sample = (frame: number, moving: boolean) => ({ frame, luma: Array.from({ length: 100 }, (_, i) => (moving && i < 30 ? 40 + ((frame * 7) % 200) : 20)) });

describe("how much of a film stands still", () => {
  it("counts samples where almost nothing changed, and the longest run of them", () => {
    const frames = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40];
    // Moving until frame 12, still from 16 to 36, moving again at 40.
    const s = stillness(
      frames.map((f) => sample(f, f <= 12 || f >= 40)),
      1000,
    );
    expect(s.longest).toEqual([16, 36]);
    expect(s.share).toBeCloseTo(5 / 10);
  });

  it("leaves the close out: the logo card may rest", () => {
    const frames = [0, 4, 8, 12, 16, 20].map((f) => sample(f, f <= 4));
    expect(stillness(frames, 1000).longest).toEqual([8, 20]);
    expect(stillness(frames, 12).longest).toEqual([8, 12]);
  });

  it("flags a kinetic film that parks longer than 0.6 s or stands still too often", () => {
    expect(parked({ share: 0.2, longest: [12, 36] }, 30)[0]).toMatch(/frames 12 to 36 stand still for 0.8 s/);
    expect(parked({ share: 0.2, longest: [12, 24] }, 30)).toEqual([]);
    expect(parked({ share: 0.55, longest: null }, 30)[0]).toMatch(/55 % of the film stands still/);
  });
});

describe("slideSheets", () => {
  const hold = (beat: string, sheet: boolean) => ({ beat, frame: 10, layout: { hero: null, type: null, sheet } });
  it("names a film whose beats each sit on a bordered sheet", () => {
    expect(slideSheets([hold("b1", true), hold("b2", true), hold("b3", true), hold("b4", false)])[0]).toMatch(/b1, b2, b3 each sit on one bordered sheet/);
  });
  it("leaves a film with a sheet or two alone", () => {
    expect(slideSheets([hold("b1", true), hold("b2", true), hold("b3", false), hold("b4", false), hold("b5", false)])).toEqual([]);
  });
});
