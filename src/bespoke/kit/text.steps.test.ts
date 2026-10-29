import { describe, expect, it } from "vitest";
import { fmtNum } from "./blocks";
import { charSteps } from "./text";

describe("Chars reveal order and length", () => {
  it("caps a long line's reveal near 24 frames instead of letting it crawl", () => {
    const long = charSteps(20, 2.2, "start");
    expect(long[19]).toBeLessThanOrEqual(16.01);
    expect(charSteps(4, 2.2, "start")).toEqual([0, 2.2, 4.4, 6.6000000000000005]);
  });
  it("starts from the middle, from both ends, or a seeded scatter", () => {
    const center = charSteps(5, 2, "center");
    expect(center[2]).toBe(0);
    expect(center[0]).toBe(center[4]);
    const edges = charSteps(5, 2, "edges");
    expect(edges[0]).toBe(0);
    expect(edges[2]).toBeGreaterThan(edges[1]);
    expect(charSteps(6, 2, "random")).toEqual(charSteps(6, 2, "random"));
  });
});

describe("fmtNum", () => {
  it("groups thousands and fixes the decimals, in the film's locale", () => {
    expect(fmtNum(2400000)).toBe("2,400,000");
    expect(fmtNum(2400000, 0, "id-ID")).toBe("2.400.000");
    expect(fmtNum(0.1 + 0.2, 2)).toBe("0.30");
  });
});
