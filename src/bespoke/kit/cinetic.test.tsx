import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { arrive, E, enter, float, holdFor, inertia, lc, lmix, MaskRise, PACE, Scramble, toScreen, wiggle } from "./cinetic";

describe("cinetic port", () => {
  it("lands its eases on 1 and zooms in log space", () => {
    expect(E.expo(1)).toBe(1);
    expect(E.out(0)).toBe(0);
    expect(lmix(1, 4, 0.5)).toBeCloseTo(2, 6);
    expect(arrive(0.94)).toBe(1);
  });

  it("chains shots without drift and tracks world points", () => {
    const A = { ax: 0, ay: 0, sx: 960, sy: 540, k: 1 };
    const B = { ax: 400, ay: 200, sx: 960, sy: 540, k: 4 };
    const mid = lc(A, B, 0.5);
    expect(mid.k).toBeCloseTo(2, 6);
    expect(toScreen(B, { x: 400, y: 200 })).toEqual({ x: 960, y: 540 });
  });

  it("holds text long enough to read, and coasts a scroll to rest", () => {
    expect(holdFor(1)).toBe(PACE.calm.holdMin);
    expect(holdFor(4, PACE.calm)).toBeGreaterThanOrEqual(30);
    const s = inertia(200, 0, 10);
    expect(s.x).toBeCloseTo(s.total, 3);
    expect(s.v).toBeLessThan(0.001);
  });

  it("reveals words from behind a mask and decodes a string, deterministically", () => {
    const before = renderToStaticMarkup(<MaskRise text="More credit." t={0} at={10} size={100} font="Inter" color="#111" />);
    const after = renderToStaticMarkup(<MaskRise text="More credit." t={60} at={10} size={100} font="Inter" color="#111" />);
    expect(before).toContain("visibility:hidden");
    expect(after).not.toContain("visibility:hidden");
    const a = renderToStaticMarkup(<Scramble text="v4.1" t={14} at={10} />);
    expect(a).toBe(renderToStaticMarkup(<Scramble text="v4.1" t={14} at={10} />));
    expect(renderToStaticMarkup(<Scramble text="v4.1" t={60} at={10} />)).toContain(">v<");
  });
});

describe("named entrances", () => {
  const scaleOf = (s: { transform?: unknown }) => Number(/scale\(([\d.]+)/.exec(String(s.transform))?.[1] ?? 1);

  it("hide the element before its cue and rest at size 1 afterwards", () => {
    for (const m of ["slam", "pop", "stamp", "drop", "rise", "zoom"] as const) {
      expect(enter(m, 10, 20).opacity).toBe(0);
      const rest = enter(m, 20 + 90, 20);
      expect(rest.opacity ?? 1).toBe(1);
      expect(scaleOf(rest)).toBeCloseTo(1, 2);
    }
  });

  it("slam starts big and lands in 0.18 s; pop overshoots to about 1.26", () => {
    expect(scaleOf(enter("slam", 21, 20))).toBeGreaterThan(3);
    expect(scaleOf(enter("slam", 26, 20))).toBeCloseTo(1, 1);
    const peak = Math.max(...Array.from({ length: 12 }, (_, i) => scaleOf(enter("pop", 20 + i, 20))));
    expect(peak).toBeGreaterThan(1.15);
    expect(peak).toBeLessThan(1.35);
  });

  it("float and wiggle stay small", () => {
    for (let t = 0; t < 200; t += 7) {
      expect(Math.abs(float(t))).toBeLessThanOrEqual(8);
      const w = wiggle(t, 2);
      expect(Math.abs(w.x)).toBeLessThanOrEqual(3);
      expect(Math.abs(w.y)).toBeLessThanOrEqual(3);
    }
  });
});
