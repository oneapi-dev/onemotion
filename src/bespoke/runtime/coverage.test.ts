import { describe, expect, it } from "vitest";
import { coverage, SPARSE_SHARE } from "./qa";

/** A 96 x 54 frame of one colour, with a w x h block of another at its centre. */
function frame(block: number, bg = 240, fg = 20): Uint8ClampedArray {
  const W = 96;
  const H = 54;
  const px = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const inside = Math.abs(x - W / 2) < block / 2 && Math.abs(y - H / 2) < block / 2;
      const v = inside ? fg : bg;
      px.set([v, v, v, 255], (y * W + x) * 4);
    }
  return px;
}

describe("coverage", () => {
  it("calls a dot on a blank page nearly empty, and a frame with a real hero not", () => {
    expect(coverage(frame(4))).toBeLessThan(SPARSE_SHARE);
    expect(coverage(frame(30))).toBeGreaterThan(SPARSE_SHARE);
  });
});
