import { describe, expect, it } from "vitest";
import { rectAt, tiltTransform } from "./morph";
import { onTwos, riso, tornPolygon } from "./print";

describe("printed looks", () => {
  it("holds each pose for two frames", () => {
    expect([0, 1, 2, 3, 4].map(onTwos)).toEqual([0, 0, 2, 2, 4]);
  });
  it("mixes two spot inks the way they overprint (multiply)", () => {
    expect(riso.overlap("#ffffff", "#2b3a7a")).toBe("#2b3a7a");
    expect(riso.overlap("#ff5a1f", "#2b3a7a")).toBe("#2b140f");
  });
  it("tears the same strip the same way every frame", () => {
    expect(tornPolygon(200, 60, 3)).toBe(tornPolygon(200, 60, 3));
    expect(tornPolygon(200, 60, 3)).not.toBe(tornPolygon(200, 60, 4));
  });
});

describe("the morph shell", () => {
  it("grows from one rectangle to the other, corners included", () => {
    const a = { x: 100, y: 100, w: 200, h: 60, r: 30 };
    const b = { x: 0, y: 0, w: 1000, h: 600, r: 24 };
    expect(rectAt(a, b, 0)).toEqual(a);
    expect(rectAt(a, b, 1)).toEqual(b);
    expect(rectAt(a, b, 0.5).w).toBe(600);
  });
});

describe("Tilt in 2D", () => {
  it("is flat at rest and foreshortens by the cosine when turned", () => {
    expect(tiltTransform(0, 0)).toBe("scale(1.0000, 1.0000) skewY(0.00deg) skewX(0.00deg)");
    expect(tiltTransform(0, -20)).toContain("scale(0.9397, 1.0000)");
  });
});
