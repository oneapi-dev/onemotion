import { describe, expect, it } from "vitest";
import { settledWarnings, type Tile } from "./review";

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
});
