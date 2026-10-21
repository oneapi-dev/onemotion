import { describe, expect, it } from "vitest";
import { LIBRARY } from "../../music/library";
import { filmTiming } from "../timing";
import { segmentsOf } from "./FilmComposition";

describe("several tracks in one film", () => {
  it("hand over on the beat: the next track's segment overlaps the first by half a bar on each side", () => {
    const beats = ["b1", "b2", "b3"].map((id) => ({ id, says: id, shows: id, voice: "", seconds: 3 }));
    const first = LIBRARY.find((t) => t.id === "advertime")!;
    const spec = { format: "landscape" as const, beats, brand: { name: "", url: "", logo: null, colors: [] }, score: { genre: "corporate-pop", bpm: first.bpm, key: "C", mode: "major", energy: [1, 1, 1], seed: 1 }, track: first.id, cues: [{ track: "goodnightmare", from: "b2" }] };
    const { timing } = filmTiming(spec.beats as never, spec.score as never);
    const segs = segmentsOf(first, spec as never, timing);
    expect(segs).toHaveLength(2);
    const at = timing.starts[1];
    expect(segs[0].from).toBe(0);
    expect(segs[0].to).toBeGreaterThan(at);
    expect(segs[1].from).toBeLessThan(at);
    expect(segs[1].to).toBe(timing.total);
    // The second track's downbeat lands on the beat: the file position at the beat is its downbeat.
    const second = LIBRARY.find((t) => t.id === "goodnightmare")!;
    expect(segs[1].trimBefore + (at - segs[1].from)).toBe(Math.round((second.downbeat ?? second.firstBeat) * 30));
  });
});
