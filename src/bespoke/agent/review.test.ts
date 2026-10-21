import { describe, expect, it } from "vitest";
import type { FilmSpec } from "../film";
import { FROZEN_FRAMES } from "../runtime/qa";
import { filmTiming } from "../timing";
import { probeFrames, reviewTiles, settledWarnings, type Tile } from "./review";

const tiles: Tile[] = [
  { id: "T1", frame: 4, label: "first frame (the thumbnail)" },
  { id: "T2", frame: 98, label: 'hold during b1: "One key"' },
  { id: "T3", frame: 154, label: "transition b1 to b2" },
  { id: "T4", frame: 230, label: 'hold during b2: "Every model"' },
];

describe("the QA on the review tiles", () => {
  it("drops what the camera's move explains on a transition tile, and keeps every hold's defects", () => {
    const warnings = [
      'frame 154: text "One key" is cut by the left edge of the frame',
      "frame 154: the frame is nearly empty (almost nothing on the background): the beat's hero should fill 50 to 75 % of the frame width",
      'frame 154: text "350 token/detik" and text "cache 95%" overlap',
      'frame 98: text "One key" is cut by the left edge of the frame',
      'frame 230: text "Every model" and text "$0.19" overlap',
      "b1 (frame 98) and b2 (frame 230) look nearly the same: two beats in a row must change",
    ];
    expect(settledWarnings(tiles, warnings)).toEqual([warnings[3], warnings[4], warnings[5]]);
  });

  it("keeps nothing from a probe frame but what its tile's freeze check says", () => {
    const warnings = [
      'frame 68: text "One key" is cut by the left edge of the frame',
      "frame 98: the film freezes like slides: b1 (frames 68 to 98, 1.0 s) holds perfectly still after the entrance",
      'frame 98: text "One key" is cut by the left edge of the frame',
    ];
    expect(settledWarnings(tiles, warnings, [68])).toEqual([warnings[1], warnings[2]]);
  });
});

describe("the probe frames", () => {
  it("lie FROZEN_FRAMES before each hold tile once the camera has landed, and skip the close and short beats", () => {
    const beat = (id: string, seconds: number) => ({ id, says: id, shows: "", voice: "", seconds });
    const spec = { format: "landscape", brand: { name: "X" }, score: { bpm: 120 }, beats: [beat("b1", 5), beat("b2", 1.2), beat("b3", 4)] } as unknown as FilmSpec;
    const { beats } = filmTiming(spec.beats, spec.score);
    const probes = probeFrames(spec);
    const hold = (i: number) => Math.round(beats[i].start + (beats[i].end - beats[i].start) * 0.65);
    expect(probes).toEqual([hold(0) - FROZEN_FRAMES]);
    expect(reviewTiles(spec).some((t) => t.frame === hold(0))).toBe(true);
  });
});
