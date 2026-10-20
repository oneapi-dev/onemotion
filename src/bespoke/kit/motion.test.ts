import { describe, expect, it } from "vitest";
import { burst, settle, stagger, wipeIn } from "./motion";

describe("craft curves", () => {
  it("settles without overshoot", () => {
    let prev = 0;
    for (let t = 0; t <= 60; t++) {
      const v = settle(t, 0, 18);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(1);
      prev = v;
    }
    expect(settle(18, 0, 18)).toBeGreaterThan(0.98);
  });

  it("rises over frames, never in one, and decays", () => {
    expect(burst(0, 0)).toBe(0);
    expect(burst(1, 0, 3)).toBeLessThan(0.5);
    expect(burst(3, 0, 3)).toBe(1);
    expect(burst(20, 0, 3, 8)).toBeLessThan(0.2);
  });

  it("caps a list's stagger", () => {
    expect(stagger(10, 0, 30)).toBe(10);
    expect(stagger(10, 29, 30)).toBeLessThanOrEqual(28);
    expect(stagger(10, 3, 4, 2)).toBe(16);
  });

  it("wipes from hidden to shown", () => {
    expect(wipeIn(0, 10, 16)).toBe("inset(100% 0 0 0)");
    expect(wipeIn(40, 10, 16)).toBe("inset(0% 0 0 0)");
  });
});
