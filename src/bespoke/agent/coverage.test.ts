import { describe, expect, it } from "vitest";
import { keyTokens, missingFigures, unshownBeats } from "./coverage";

const beats = [
  { id: "b1", says: "Top up $10." },
  { id: "b2", says: "MORE CREDIT. SAME PRICE." },
  { id: "b3", says: "" },
];

describe("unshownBeats", () => {
  it("passes a film whose source shows its storyboard", () => {
    const files = { "scene/index.tsx": `<PriceCount to={10} prefix="$" /> <h1>More credit. Same price.</h1>` };
    expect(unshownBeats(beats, files)).toEqual([]);
  });

  it("names the beats a film never shows (a debug dump, a blank stage)", () => {
    const files = { "scene/index.tsx": `export default () => <pre>{Object.keys(kit).join(",")}</pre>` };
    expect(unshownBeats(beats, files)).toEqual(["b1", "b2"]);
  });

  it("reads the words the frames actually show, not files the scene no longer uses", () => {
    // A debug scene that replaced the film: its old components still hold the words, the frames do not.
    expect(unshownBeats(beats, { rendered: "HELLO RED" })).toEqual(["b1", "b2"]);
    expect(unshownBeats(beats, { rendered: "Top up $10 More credit. Same price." })).toEqual([]);
  });

  it("reads the figures and the words that matter", () => {
    expect(keyTokens("$10 → $15, 50% BONUS with your credit")).toEqual({ figures: ["10", "15", "50"], words: ["bonus", "credit"] });
  });
});

describe("missingFigures", () => {
  it("names the numbers a beat promises and the frames never show, even when its other numbers are there", () => {
    const b = [
      { id: "b5", says: "Cache US$0.006 > $0.0042 · Speed token up to 350 · Cache hit rate up to 95%" },
      { id: "b3", says: "Input US$0.30 > $0.19" },
    ];
    expect(missingFigures(b, { rendered: "CACHE US$0.006 US$0.0042 Speed token up to 350 Cache hit rate INPUT US$0.3 US$0.19" })).toEqual([{ id: "b5", figures: ["95"] }]);
    expect(missingFigures(b, { rendered: "0.006 0.0042 350 95% 0.30 0.19" })).toEqual([]);
  });
});
