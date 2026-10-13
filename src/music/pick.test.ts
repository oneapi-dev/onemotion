import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { Plan } from "../engine/plan";
import { normalizeConcept, trackFor } from "../bespoke/agent/concept";
import { LIBRARY } from "./library";
import { trackOf } from "./pick";
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
    expect(["advertime", "inspiration", "adding-the-sun", "inventing-flight"]).toContain(a?.id);
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
  const concept = (music: string) => normalizeConcept({ music, beats: [{ says: "a" }, { says: "b" }] });

  it("takes the director's pick, or none for composed", () => {
    expect(trackFor(concept("arpent"), 1)).toBe("arpent");
    expect(trackFor(concept("composed"), 1)).toBeUndefined();
  });

  it("avoids the recent films' tracks when the director picked none", () => {
    const recent = LIBRARY.slice(0, LIBRARY.length - 1).map((t) => t.id);
    expect(trackFor(concept("not-a-track"), 5, recent)).toBe(LIBRARY[LIBRARY.length - 1].id);
  });
});
