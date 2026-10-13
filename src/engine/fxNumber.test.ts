import { describe, expect, it } from "vitest";
import { odometerPositions } from "./fxNumber";

describe("odometerPositions", () => {
  it("starts every digit at 0 and stops each on its own digit", () => {
    expect(odometerPositions("$0.07", -5, 0, 40)).toEqual([0, 0, 0]);
    expect(odometerPositions("$0.07", 100, 0, 40)).toEqual([0, 0, 7]);
    expect(odometerPositions("200+", 100, 0, 40)).toEqual([2, 0, 0]);
  });

  it("spins in between, the last digit furthest", () => {
    const mid = odometerPositions("99", 15, 0, 40);
    expect(mid.every((p) => p > 0 && p < 10)).toBe(true);
  });
});
