import { describe, expect, it } from "vitest";
import { filmSpecOf, languageName, musicPlanOf, normalizeConcept, UnusableConceptError, voiceLanguageOf } from "./concept";
import { paceOf, paceRule } from "./styles";

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

  it("never sets a whole film in monospace: Brutalist mono gets its condensed display, anything else a sans text face", () => {
    const allMono = { ...raw, typography: { display: "Space Mono", text: "IBM Plex Mono", mono: "JetBrains Mono" } };
    const brutal = normalizeConcept({ ...allMono, look: { direction: "Brutalist mono" } });
    expect(brutal.typography).toEqual({ display: "Bebas Neue", text: "IBM Plex Mono", mono: "JetBrains Mono" });
    expect(brutal.notes?.join(" ")).toMatch(/both monospace/);
    const other = normalizeConcept({ ...allMono, look: { direction: "Cinematic dark" } });
    expect(other.typography).toEqual({ display: "Space Mono", text: "Inter Tight", mono: "JetBrains Mono" });
    // One mono face beside a sans is a choice, kept as it is.
    expect(normalizeConcept({ ...raw, typography: { display: "Space Mono", text: "Inter" } }).typography.display).toBe("Space Mono");
  });

  it("refuses a concept without beats", () => {
    expect(normalizeConcept({ beats: [{ says: "one", shows: "a word on paper" }] }).beats).toHaveLength(1);
    expect(() => normalizeConcept({ beats: [] })).toThrow(UnusableConceptError);
    // A model that answered in its own shape (no "shows"): asked again rather than built from nothing.
    expect(() => normalizeConcept({ beats: Array.from({ length: 18 }, (_, i) => ({ scene: i, text: "x" })) })).toThrow(/No beat has "shows"/);
    expect(() => normalizeConcept({ beats: [{ says: "a", shows: "a card" }, { says: "b" }] })).toThrow(/1 of 2 beats \(b2\) lacks "shows"/);
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

  it("gives a collaboration film its partner, with the partner's logo, colour and who leads", () => {
    const partner = { site: { logo: "data:image/svg+xml;base64,AA", accent: "#00AA55", name: "Acme", domain: "acme.dev" } as never, lead: "equal" as const };
    const spec = filmSpecOf(normalizeConcept(raw), "landscape", null, 7, [], partner);
    expect(spec.partner).toEqual({ name: "Acme", url: "acme.dev", logo: "data:image/svg+xml;base64,AA", colors: ["#00AA55"], lead: "equal" });
    expect(spec.brand.name).toBe("OneAPI");
    expect(filmSpecOf(normalizeConcept(raw), "landscape", null, 7).partner).toBeUndefined();
  });
});

describe("custom briefs", () => {
  const beat = (i: number, seconds = 2) => ({ says: `Scene ${i}`, shows: `picture ${i}`, voice: `Line ${i}.`, seconds });

  it("builds a film of one continuous beat, as long as the brief asks", () => {
    const c = normalizeConcept({ beats: [{ ...beat(1, 45), moments: [{ at: "3", what: "the logo draws on" }, { at: "kunci", what: "a key turns" }] }] });
    expect(c.beats).toHaveLength(1);
    expect(c.beats[0].seconds).toBe(45);
    expect(c.beats[0].moments).toEqual([
      { at: "3", what: "the logo draws on" },
      { at: "kunci", what: "a key turns" },
    ]);
    expect(c.notes).toBeUndefined();
  });

  it("keeps a long storyboard whole: many beats are joined, never dropped", () => {
    const c = normalizeConcept({ beats: Array.from({ length: 52 }, (_, i) => beat(i + 1)) });
    expect(c.beats).toHaveLength(40);
    const said = c.beats.map((b) => b.voice).join(" ");
    for (let i = 1; i <= 52; i++) expect(said).toContain(`Line ${i}.`);
    expect(c.beats[39].says).toBe("Scene 52");
    expect(c.notes?.[0]).toMatch(/52 beats/);
  });

  it("keeps locked narration whole, and cuts over-long text only between words", () => {
    const narration = "Ini adalah narasi panjang yang ditulis persis oleh orang itu sendiri, kata demi kata, dan tidak boleh dipotong di tengah. ".repeat(4).trim();
    const c = normalizeConcept({ beats: [{ ...beat(1), voice: narration, says: "word ".repeat(120) }] });
    expect(c.beats[0].voice).toBe(narration);
    expect(c.beats[0].says.length).toBeLessThanOrEqual(400);
    expect(c.beats[0].says.endsWith("word")).toBe(true);
  });

  it("says when a film over the length limit is shortened", () => {
    const c = normalizeConcept({ beats: [beat(1, 170), beat(2, 170)] });
    expect(c.beats.reduce((a, b) => a + b.seconds, 0)).toBeCloseTo(300, 0);
    expect(c.notes?.[0]).toMatch(/340 s/);
  });
});

describe("a concept in the model's own shape", () => {
  it("reads a production-document storyboard into beats", () => {
    const c = normalizeConcept({
      project: { title: "OneAPI — 50% Top-Up Bonus" },
      storyboard: {
        note: "beat-driven",
        scenes: [
          { id: "S1", name: "Cold open", duration_sec: "2.5–3.5", visual: "A hairline draws; the logo fades in.", typography: "None", motion: "Line draw." },
          { id: "S2", name: "The morph", duration_sec: "4–5", visual: "$10 morphs into $15.", typography: "'$10' morphs into '$15'." },
        ],
      },
    });
    expect(c.title).toBe("OneAPI — 50% Top-Up Bonus");
    expect(c.beats.map((b) => b.id)).toEqual(["b1", "b2"]);
    expect(c.beats[0].shows).toContain("logo fades in");
    expect(c.beats[0].seconds).toBe(3);
    expect(c.beats[1].says).toContain("$15");
  });
});

describe("the shot list", () => {
  it("keeps each beat's purpose and the states it enters and leaves, and joins them when beats merge", () => {
    const c = normalizeConcept({
      beats: [
        { says: "a", shows: "a card", purpose: "the viewer learns the price fell", enters: "the old price alone", leaves: "the new price beside it" },
        { says: "b", shows: "the close" },
      ],
    });
    expect(c.beats[0]).toMatchObject({ purpose: "the viewer learns the price fell", enters: "the old price alone", leaves: "the new price beside it" });
    expect(c.beats[1].purpose).toBeUndefined();
  });
});

describe("the music plan", () => {
  const beats = [{ id: "b1" }, { id: "b2" }, { id: "b3" }, { id: "b4" }];
  it("keeps library tracks on later beats, in order, each a change from the one before, at most two", () => {
    const plan = musicPlanOf(
      [
        { track: "goodnightmare", from: "b3" },
        { track: "fresh-focus", from: "b2" },
        { track: "fresh-focus", from: "b4" },
        { track: "no-such-track", from: "b2" },
        { track: "groovin", from: "b1" },
      ],
      beats,
      "advertime",
    );
    expect(plan).toEqual([
      { track: "fresh-focus", from: "b2" },
      { track: "goodnightmare", from: "b3" },
    ]);
    expect(musicPlanOf("nope", beats, "advertime")).toEqual([]);
  });
});

describe("the narration language", () => {
  it("follows the film unless the person narrates in another language, and survives a reload", () => {
    expect(voiceLanguageOf({ language: "en" })).toBe("en");
    expect(voiceLanguageOf({ language: "en", voiceLanguage: "id" })).toBe("id");
    expect(languageName("id")).toBe("Indonesian");
  });
});

describe("the film's pace", () => {
  it("reads the pace, else an old concept's ENERGY dial or a kinetic look, else calm", () => {
    expect(paceOf({ pace: "lively" })).toBe("lively");
    expect(paceOf({ pace: "frantic", dials: "ENERGY 2 / RHYTHM 2 / MOTION 2" })).toBe("balanced");
    expect(paceOf({ direction: "Kinetic type" })).toBe("loud");
    expect(paceOf({})).toBe("calm");
  });
  it("gives the motion designer one line of numbers to hold", () => {
    expect(paceRule("calm")).toContain("entrances 12 to 18 frames, the beat's hero 24 to 36");
    expect(paceRule("calm")).toContain("holds at least 0.6 s");
  });
});
