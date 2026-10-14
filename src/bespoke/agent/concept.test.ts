import { describe, expect, it } from "vitest";
import { filmSpecOf, normalizeConcept, UnusableConceptError } from "./concept";

const raw = {
  title: "Switchboard",
  language: "id",
  style: "hand-drawn canvas",
  typography: { display: "Space Grotesk", text: "Comic Sans" },
  palette: { bg: "#f4f2ec", ink: "nope", accent: "#FF4F1F" },
  brand: { name: "OneAPI", url: "https://oneapi.id/" },
  beats: [
    { id: "x", says: "Satu kunci.", shows: "a key", seconds: 0.2 },
    { says: "Banyak model.", shows: "nodes", seconds: 3 },
    { says: "oneapi.id", shows: "the close", seconds: 1 },
  ],
  score: { genre: "house", bpm: 999, energy: [1, 2, 9] },
};

describe("normalizeConcept", () => {
  it("renumbers beats, clamps lengths and holds the close for three seconds", () => {
    const c = normalizeConcept(raw);
    expect(c.beats.map((b) => b.id)).toEqual(["b1", "b2", "b3"]);
    expect(c.beats[0].seconds).toBe(0.8);
    expect(c.beats[2].seconds).toBe(3);
    expect(c.language).toBe("id");
  });

  it("keeps the style brief, and an empty one when the model wrote none", () => {
    const c = normalizeConcept({
      ...raw,
      look: { direction: "Editorial light", candidates: ["Object metaphor", "Living number", "Claim, how, result", "extra"], concept: "Object metaphor", background_motion: "floating colour blobs", special_moment: "b3", unknown: 1 },
    });
    expect(c.look.direction).toBe("Editorial light");
    expect(c.look.candidates).toEqual(["Object metaphor", "Living number", "Claim, how, result"]);
    expect(c.look.backgroundMotion).toBe("floating colour blobs");
    expect(c.look.specialMoment).toBe("b3");
    expect(normalizeConcept(raw).look.direction).toBe("");
  });

  it("repairs colours, fonts and the brand URL", () => {
    const c = normalizeConcept(raw);
    expect(c.palette.ink).toBe("#151515");
    expect(c.palette.bg).toBe("#F4F2EC");
    expect(c.typography.text).toBe("Inter");
    expect(c.brand.url).toBe("oneapi.id");
  });

  it("refuses a concept without beats", () => {
    expect(() => normalizeConcept({ beats: [{ says: "one" }] })).toThrow(UnusableConceptError);
    expect(() => normalizeConcept("not json")).toThrow(UnusableConceptError);
  });

  it("makes a film spec with a valid score and the site's logo", () => {
    const spec = filmSpecOf(normalizeConcept(raw), "portrait", { logo: "data:image/png;base64,AA", accent: "#123456", name: "OneAPI", domain: "oneapi.id" } as never, 7);
    expect(spec.format).toBe("portrait");
    expect(spec.brand.logo).toMatch(/^data:/);
    expect(spec.brand.colors[0]).toBe("#123456");
    expect(spec.score.genre).toBe("house");
    expect(spec.score.bpm).toBeLessThanOrEqual(130);
  });
});
