import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { arrive, E, holdFor, inertia, lc, lmix, MaskRise, PACE, Scramble, toScreen } from "./cinetic";

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
