import { describe, expect, it } from "vitest";
import { cardSize } from "./cards";
import type { SceneType } from "./plan";
import { HOLD_ZOOM } from "./rig";

const TYPES: SceneType[] = ["hook", "logo", "statement", "screenshot", "device", "features", "steps", "converge", "stat", "quote", "offer", "cta", "announce", "chat", "code", "checklist", "bars", "compare", "kinetic", "specs"];
const LAYOUTS = { wide: [1920, 1080], tall: [1080, 1920], square: [1080, 1080] } as const;

describe("cardSize", () => {
  for (const [layout, [width, height]] of Object.entries(LAYOUTS)) {
    it(`keeps every card inside the frame at the end of a hold (${layout})`, () => {
      const look = { u: Math.min(width, height) / 1080, layout: layout as keyof typeof LAYOUTS };
      for (const type of TYPES) {
        const { w, h } = cardSize(look, type);
        // A margin of at least 4% each side once the push has gone furthest.
        expect(w * HOLD_ZOOM, type).toBeLessThanOrEqual(width * 0.92);
        expect(h * HOLD_ZOOM, type).toBeLessThanOrEqual(height * 0.92);
      }
    });
  }
});
