import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Plan } from "../engine/plan";
import { normalizeConcept, trackFor } from "../bespoke/agent/concept";
import { LIBRARY } from "./library";
import { BY_MOOD, QUICK_MAX_BPM, trackOf } from "./pick";
import { scoreOf } from "./score";

const plan = (angle: string, music: Plan["music"] = "bright") => ({ angle, music, scenes: [{}, {}, {}] }) as unknown as Plan;

describe("the music library", () => {
  it("has a file for every track", () => {
    for (const t of LIBRARY) expect(existsSync(path.join(__dirname, "..", "..", "public", "music", `${t.id}.mp3`)), t.id).toBe(true);
  });
});

describe("trackOf", () => {
  it("picks a track for the plan's mood, the same one every time for the same plan", () => {
    const a = trackOf(plan("One key for every model."));
    expect(a).not.toBeNull();
    expect(trackOf(plan("One key for every model."))?.id).toBe(a?.id);
    expect(BY_MOOD.bright).toContain(a?.id);
    // Under the template camera's tempo limit.
    expect(a!.bpm).toBeLessThan(QUICK_MAX_BPM);
  });

  it("varies across takes and moods", () => {
    const ids = new Set(["a", "b", "c", "d", "e", "f", "g", "h"].map((x) => trackOf(plan(`take ${x}`, "drive"))?.id));
    expect(ids.size).toBeGreaterThan(1);
  });

  it("sets the tempo the cards snap to, and leaves a written score to the composer", () => {
    const p = plan("One key for every model.");
    expect(scoreOf(p).bpm).toBe(trackOf(p)?.bpm);
    expect(trackOf({ ...p, score: { genre: "house" } } as never)).toBeNull();
  });
});

describe("trackFor", () => {
  const concept = (music: string) => normalizeConcept({ music, beats: [{ says: "a", shows: "a card" }, { says: "b", shows: "the logo" }] });

  it("takes the director's pick, or none for composed", () => {
    expect(trackFor(concept("screen-saver"), 1)).toBe("screen-saver");
    expect(trackFor(concept("composed"), 1)).toBeUndefined();
  });

  it("never repeats a recent film's track, even when the director picks it again", () => {
    // The art director picks the same "tech" track for every tech product; four films in a row must not all play it.
    const played: string[] = [];
    for (let i = 0; i < 4; i++) played.unshift(trackFor(concept("screen-saver"), i, played.slice(0, 4)) as string);
    expect(new Set(played).size).toBe(4);
    expect(played[3]).toBe("screen-saver");
    // The stand-in is close in mood: an electronic, tech-feeling track.
    const standIn = LIBRARY.find((t) => t.id === played[2]);
    expect(standIn?.tags.some((x) => ["tech", "electronic"].includes(x))).toBe(true);
  });

  it("plays the art director's next pick for the vibe before guessing one", () => {
    const c = normalizeConcept({ music: "motions", music_alternates: ["inspiration", "motions", "nope", "adding-the-sun"], beats: [{ says: "a", shows: "a card" }] });
    expect(c.musicAlternates).toEqual(["inspiration", "adding-the-sun"]);
    expect(trackFor(c, 3, ["motions"])).toBe("inspiration");
    expect(trackFor(c, 3, ["motions", "inspiration"])).toBe("adding-the-sun");
  });

  it("never offers a track that is no longer in the library", () => {
    expect(LIBRARY.some((t) => t.id === "arpent")).toBe(false);
  });

  it("avoids the recent films' tracks when the director picked none", () => {
    const recent = LIBRARY.slice(0, LIBRARY.length - 1).map((t) => t.id);
    expect(trackFor(concept("not-a-track"), 5, recent)).toBe(LIBRARY[LIBRARY.length - 1].id);
  });
});
