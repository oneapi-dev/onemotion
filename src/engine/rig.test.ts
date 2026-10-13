import { describe, expect, it } from "vitest";
import type { CameraPath, Plan } from "./plan";
import { PERSPECTIVE, VOICE_LEAD, cameraAt, moveWindow, planTiming, projector, stations } from "./rig";

const plan: Plan = {
  angle: "test",
  archetype: "promo",
  brand: "Test",
  look: "midnight",
  path: "dolly",
  tone: "punchy",
  caption: "",
  fonts: { display: "Inter", body: "Inter" },
  music: "drive",
  scenes: Array.from({ length: 6 }, (_, i) => ({ type: i === 5 ? ("cta" as const) : ("statement" as const), duration: 4, title: "x" })),
};

describe("cameraAt", () => {
  const timing = planTiming(plan);
  const formats = { landscape: [1920, 1080], portrait: [1080, 1920] } as const;

  for (const path of ["dolly", "serpentine", "staircase"] as CameraPath[]) {
    for (const [format, [width, height]] of Object.entries(formats)) {
      it(`keeps the held card centered while it pushes in (${path}, ${format})`, () => {
        const u = Math.min(width, height) / 1080;
        const route = stations(plan.scenes.length, path, width, height, u);
        route.forEach((st, i) => {
          const leave = i < route.length - 1 ? moveWindow(i + 1, timing)[0] : timing.total;
          // The last frame of the hold, where the push has gone furthest.
          const cam = cameraAt(leave - 1, timing, route, u);
          const p = projector(cam, width, height, PERSPECTIVE * u)(st.pos.x, st.pos.y, st.pos.z);
          // Only the deliberate sway (30u, gone by the end) and lift (12u) may move it.
          expect(Math.abs(p.x)).toBeLessThanOrEqual(31 * u);
          expect(Math.abs(p.y)).toBeLessThanOrEqual(13 * u);
        });
      });

      it(`leaves each card from where its hold ended (${path}, ${format})`, () => {
        const u = Math.min(width, height) / 1080;
        const route = stations(plan.scenes.length, path, width, height, u);
        for (let i = 1; i < route.length; i++) {
          const [from] = moveWindow(i, timing);
          // The hold creeps a px or so a frame; a jump would be tens.
          expect(cameraAt(from, timing, route, u).speed).toBeLessThan(3);
        }
      });
    }
  }
});

describe("planTiming with a voiceover", () => {
  it("holds each scene for its recorded line, past the usual cap", () => {
    const voiced: Plan = {
      ...plan,
      scenes: plan.scenes.map((s, i) => (i === 2 ? { ...s, duration: 3, narration: "x", narration_seconds: 5.5 } : s)),
    };
    const t = planTiming(voiced);
    expect(t.frames[2]).toBeGreaterThanOrEqual(Math.ceil((5.5 + VOICE_LEAD + 0.4) * 30));
    // Scenes without a recorded line keep their timing.
    expect(t.frames[1]).toBe(planTiming(plan).frames[1]);
  });
});
