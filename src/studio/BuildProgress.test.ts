import { describe, expect, it } from "vitest";
import { buildSteps, progressOf } from "./BuildProgress";

const state = (steps: ReturnType<typeof buildSteps>) => steps.map((s) => `${s.id}:${s.state}`).join(" ");

describe("build progress", () => {
  it("walks through the steps as the build goes", () => {
    expect(state(buildSteps({ stage: "site", hasFilm: false, log: [], finished: false }))).toBe("site:now concept:next scene:next review:next final:next");
    expect(state(buildSteps({ stage: "film", hasFilm: false, log: [], finished: false }))).toBe("site:done concept:now scene:next review:next final:next");
    expect(state(buildSteps({ stage: "film", hasFilm: true, log: [{ text: "[lead] check: ok" }], finished: false }))).toBe("site:done concept:done scene:now review:next final:next");
    const review = buildSteps({ stage: "film", hasFilm: true, log: [{ text: "[review] round 1: the art director is looking at the frames" }, { text: "[review] round 2: the art director is looking at the frames" }], finished: false });
    expect(state(review)).toBe("site:done concept:done scene:done review:now final:next");
    expect(review[3].label).toBe("Art director review (round 2 of 2)");
    expect(state(buildSteps({ stage: "film", hasFilm: true, log: [{ text: "[review] round 1" }, { text: "[review] fixing 3 measured defects the QA still found" }], finished: false }))).toBe("site:done concept:done scene:done review:done final:now");
  });

  it("fills the bar with the steps done and half of the one running", () => {
    expect(progressOf(buildSteps({ stage: "film", hasFilm: false, log: [], finished: false }))).toBeCloseTo(0.3, 5);
    expect(progressOf(buildSteps({ stage: null, hasFilm: true, log: [], finished: true }))).toBe(1);
  });
});
