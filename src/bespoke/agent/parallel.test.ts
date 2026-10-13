import { describe, expect, it } from "vitest";
import { BEATS_INDEX, beatOf, beatView, beatsIndex, ownsBeat, pool, snapshotBeat, stubBeat } from "./parallel";

describe("beat files", () => {
  it("knows which beat a path belongs to", () => {
    expect(beatOf("scene/beats/b3.tsx")).toBe("b3");
    expect(beatOf("scene/beats/b3/Pen.tsx")).toBe("b3");
    expect(beatOf(BEATS_INDEX)).toBeNull();
    expect(beatOf("scene/index.tsx")).toBeNull();
    expect(ownsBeat("b3")("scene/beats/b3/Pen.tsx")).toBe(true);
    expect(ownsBeat("b3")("scene/beats/b30.tsx")).toBe(false);
    expect(ownsBeat("b3")("scene/theme.ts")).toBe(false);
  });

  it("generates the registry of beats", () => {
    const src = beatsIndex(["b1", "b2"]);
    expect(src).toContain('import Beatb1 from "./b1";');
    expect(src).toContain("export const BEATS: Record<string, ComponentType> = { b1: Beatb1, b2: Beatb2 };");
  });

  it("gives a beat agent its own work with the other beats' last good versions", () => {
    const files = {
      "scene/index.tsx": "stage",
      [BEATS_INDEX]: "index",
      "scene/beats/b1.tsx": "b1 half-written",
      "scene/beats/b2.tsx": "b2 being written now",
      "scene/beats/b2/Pen.tsx": "b2 helper",
      "scene/beats/b3.tsx": stubBeat("b3"),
    };
    const good = { b1: { "scene/beats/b1.tsx": "b1 good" }, b3: { "scene/beats/b3.tsx": stubBeat("b3") } };
    expect(beatView("b2", files, good)).toEqual({
      "scene/index.tsx": "stage",
      [BEATS_INDEX]: "index",
      "scene/beats/b1.tsx": "b1 good",
      "scene/beats/b2.tsx": "b2 being written now",
      "scene/beats/b2/Pen.tsx": "b2 helper",
      "scene/beats/b3.tsx": stubBeat("b3"),
    });
    expect(snapshotBeat("b2", files)).toEqual({ "scene/beats/b2.tsx": "b2 being written now", "scene/beats/b2/Pen.tsx": "b2 helper" });
  });
});

describe("pool", () => {
  it("never runs more than the limit at once, and keeps the order", async () => {
    let running = 0;
    let peak = 0;
    const task = (v: number) => async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running--;
      if (v === 2) throw new Error("two");
      return v;
    };
    const r = await pool([task(0), task(1), task(2), task(3), task(4)], 3);
    expect(peak).toBe(3);
    expect(r.map((x) => (x.status === "fulfilled" ? x.value : "x"))).toEqual([0, 1, "x", 3, 4]);
  });
});
