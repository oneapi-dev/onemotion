import { describe, expect, it } from "vitest";
import type { FilmSpec } from "../film";
import { BEATS_INDEX, beatFile, beatsIndex } from "./parallel";
import { normalizeConcept } from "./concept";
import { applyRevision, brokenCues, inferLocks, NO_LOCKS, normalizeRevision, type RevisionPlan } from "./revise";
import { SchemaError } from "./llm";

const concept = normalizeConcept({
  title: "Switchboard",
  beats: [
    { says: "Satu kunci", voice: "Satu kunci untuk semua model.", shows: "a key", seconds: 2.5 },
    { says: "Harga jelas", voice: "Mulai lima dolar.", shows: "a receipt", seconds: 3 },
    { says: "oneapi.id", voice: "Coba sekarang di oneapi.id.", shows: "the close", seconds: 3 },
  ],
});
const spec: FilmSpec = {
  format: "landscape",
  brand: { name: "OneAPI", url: "oneapi.id", logo: null, colors: [] },
  score: { genre: "corporate-pop", bpm: 110, key: "C", mode: "major", chords: [], energy: [1, 1, 1], moments: [], seed: 1 } as unknown as FilmSpec["score"],
  beats: concept.beats.map((b, i) => ({ ...b, ...(i === 1 ? { voiceSeconds: 1.4, words: [{ text: "Mulai", start: 0, end: 0.4 }, { text: "lima", start: 0.5, end: 0.8 }, { text: "dolar.", start: 0.9, end: 1.3 }], tts: "Mulai lima dolar." } : {}) })),
};
const files = {
  "scene/index.tsx": 'export default function Scene() { return null; } const a = cue("b2:dolar"); const b = cue("b3");',
  [BEATS_INDEX]: beatsIndex(["b1", "b2", "b3"]),
  [beatFile("b1")]: "b1",
  [beatFile("b2")]: "b2",
  [beatFile("b3")]: "b3",
};
const film = { concept, spec, files };

const plan = (p: Partial<RevisionPlan>): RevisionPlan => ({ summary: "", areas: [], targets: [], edits: [], add: [], remove: [], design: "", ...p });

describe("inferLocks", () => {
  it("reads locks a note asks for, in English and Indonesian", () => {
    expect(inferLocks("Improve animation timing without changing narration.").narration).toBe(true);
    expect(inferLocks("Perbaiki animasinya tapi jangan ubah narasi").narration).toBe(true);
    expect(inferLocks("Keep the narration but completely redesign the visuals.")).toEqual({ ...NO_LOCKS, narration: true });
    expect(inferLocks("Don't change the current scene structure.").structure).toBe(true);
    expect(inferLocks("Make it feel more cinematic.")).toEqual(NO_LOCKS);
    expect(inferLocks("Use fewer cards and more typography.")).toEqual(NO_LOCKS);
    expect(inferLocks("Improve the timing around the music, keep the music").music).toBe(true);
  });
});

describe("applyRevision", () => {
  it("never changes the narration on a timing note, whatever the model planned", () => {
    const locks = inferLocks("Improve animation timing without changing narration.");
    const p = plan({ areas: ["animation", "pacing", "narration"], edits: [{ id: "b2", voice: "Hanya lima dolar sebulan!", seconds: 4 }], design: "retime the receipt" });
    const r = applyRevision(film, p, locks);
    expect(r.spec.beats.map((b) => b.voice)).toEqual(spec.beats.map((b) => b.voice));
    expect(r.spec.beats[1].words).toEqual(spec.beats[1].words);
    expect(r.spec.beats[1].tts).toBe("Mulai lima dolar.");
    expect(r.revoice).toEqual([]);
    expect(r.refused[0]).toMatch(/voice line of b2.*narration is locked/);
    expect(r.spec.beats[1].seconds).toBe(4);
    expect(r.code).toBe(true);
  });

  it("keeps the narration when the note is not about it, even unlocked", () => {
    const r = applyRevision(film, plan({ areas: ["typography"], edits: [{ id: "b1", voice: "Something else." }], design: "bigger display type in b1" }), NO_LOCKS);
    expect(r.spec.beats[0].voice).toBe(spec.beats[0].voice);
    expect(r.refused).toHaveLength(1);
  });

  it("records only the lines that changed", () => {
    const r = applyRevision(film, plan({ areas: ["narration"], edits: [{ id: "b2", voice: "Mulai dari lima dolar." }] }), NO_LOCKS);
    expect(r.spec.beats[1].voice).toBe("Mulai dari lima dolar.");
    expect(r.spec.beats[1].words).toBeUndefined();
    expect(r.revoice).toEqual([1]);
    expect(r.code).toBe(false);
  });

  it("changes only the music on a music note: no code, no voice", () => {
    const r = applyRevision(film, plan({ areas: ["music"], track: "advertime" }), NO_LOCKS);
    expect(r.music).toBe(true);
    expect(r.spec.track).toBe("advertime");
    expect(r.spec.score.bpm).toBe(120);
    expect(r.code).toBe(false);
    expect(r.revoice).toEqual([]);
    expect(r.spec.beats).toEqual(spec.beats);
  });

  it("adds and removes beats with stable ids and keeps the beat files in step", () => {
    const r = applyRevision(film, plan({ areas: ["structure"], add: [{ after: "b1", says: "Baru", voice: "Baru.", shows: "x", seconds: 2 }], remove: ["b2"] }), NO_LOCKS);
    expect(r.spec.beats.map((b) => b.id)).toEqual(["b1", "b4", "b3"]);
    expect(r.files[beatFile("b2")]).toBeUndefined();
    expect(r.files[beatFile("b4")]).toBeDefined();
    expect(r.files[BEATS_INDEX]).toContain("b4");
    expect(r.revoice).toEqual([1]);
  });

  it("refuses structure changes when the structure is locked", () => {
    const r = applyRevision(film, plan({ areas: ["structure"], remove: ["b2"] }), { ...NO_LOCKS, structure: true });
    expect(r.spec.beats).toHaveLength(3);
    expect(r.refused[0]).toMatch(/removing b2/);
  });
});

describe("normalizeRevision", () => {
  it("names the problems so the model can fix them", () => {
    try {
      normalizeRevision({ areas: ["typography"], edits: [{ id: "b9", says: "x" }], design: "" }, spec);
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaError);
      expect((e as SchemaError).problems.join("\n")).toMatch(/b9.*not a beat[\s\S]*"design"/);
    }
  });
});

describe("brokenCues", () => {
  it("finds cues whose beat or word is gone", () => {
    const beats = spec.beats.filter((b) => b.id !== "b3").map((b) => (b.id === "b2" ? { ...b, words: [{ text: "Hanya", start: 0, end: 1 }] } : b));
    expect(brokenCues(files, beats)).toEqual([
      'scene/index.tsx: cue("b2:dolar"): beat b2 no longer says "dolar" (it says: Mulai lima dolar.)',
      'scene/index.tsx: cue("b3") names beat b3, which is no longer in the film',
    ]);
    expect(brokenCues(files, spec.beats)).toEqual([]);
  });

  it("reads a beat file's own cues as words of that beat", () => {
    const local = { "scene/beats/b2.tsx": 'const { cue } = useBeat(); const a = cue("dolar"); const b = cue("@0.5"); const e = cue("end");' };
    expect(brokenCues(local, spec.beats)).toEqual([]);
    const edited = spec.beats.map((b) => (b.id === "b2" ? { ...b, words: undefined, voice: "Hanya lima." } : b));
    expect(brokenCues(local, edited)).toEqual(['scene/beats/b2.tsx: cue("dolar"): beat b2 no longer says "dolar" (it says: Hanya lima.)']);
  });
});
