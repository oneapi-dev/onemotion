import { describe, expect, it } from "vitest";
import { briefRepeats } from "./run";

const brief = "INPUT — $0.20 / 1M TOKENS\nOUTPUT — $0.48 / 1M TOKENS\nCACHE — $0.0042 / 1M TOKENS\nPrice $0.2 once.";

describe("a figure the brief repeats itself", () => {
  it("is not a defect when the brief writes it three times, and still is when it does not", () => {
    expect(briefRepeats('frame 700: "1m" appears in 3 places in one frame (a headline, a chip and a label all saying it): say it once', brief)).toBe(true);
    expect(briefRepeats('frame 41: "$0.2" appears in 3 places in one frame (a headline, a chip and a label all saying it): say it once', brief)).toBe(false);
    expect(briefRepeats('frame 41: text "Input" is cut by the left edge of the frame', brief)).toBe(false);
  });
});
