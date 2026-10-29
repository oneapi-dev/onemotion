import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { curvePts, dataAt, flatten, formulaState, FormulaSteps, layoutTokens, morphPoints, Plot, plotMap, resample, type Tok } from "./math";

const html = (node: React.ReactElement) => renderToStaticMarkup(node);
/** Each character 10 px per 20 px of size: an exact stand-in for the font. */
const measure = (s: string, fs: number) => s.length * fs * 0.5;

/** Distance from a point to the nearest edge of a polygon. */
const toEdge = ([x, y]: [number, number], poly: [number, number][]) =>
  Math.min(
    ...poly.map((a, i) => {
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const k = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(x - (a[0] + dx * k), y - (a[1] + dy * k));
    }),
  );

describe("plot", () => {
  it("maps graph space onto the box, y up", () => {
    const M = plotMap([0, 10], [-1, 1], 500, 200);
    expect(M(0, -1)).toEqual([0, 200]);
    expect(M(10, 1)).toEqual([500, 0]);
    expect(M(5, 0)).toEqual([250, 100]);
  });

  it("samples a curve up to its leading edge exactly", () => {
    const pts = curvePts(Math.sin, [0, 6], 3, 60);
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1][0]).toBe(3);
    expect(pts[pts.length - 1][1]).toBeCloseTo(Math.sin(3), 9);
    expect(pts.every(([x], i) => i === 0 || x > pts[i - 1][0])).toBe(true);
    expect(dataAt([[0, 0], [2, 4]], 1)).toBe(2);
  });

  it("draws axes, then the curve with its tracer, and a readout from the same value", () => {
    const props = { xs: [0, 6.28] as [number, number], ys: [-1.2, 1.2] as [number, number], w: 600, h: 300, ink: "#eee", color: "#fc0", font: "Newsreader", fn: Math.sin, readout: (x: number, y: number) => `y = ${y.toFixed(2)} @ ${x.toFixed(2)}` };
    expect(html(<Plot t={10} at={0} {...props} />)).not.toContain("<circle");
    const done = html(<Plot t={100} at={0} track={Math.PI / 2} {...props} />);
    expect(done).toContain("<circle");
    expect(done).toContain("y = 1.00 @ 1.57");
  });
});

describe("formula", () => {
  const A: Tok[] = [{ s: "y" }, { s: "=" }, { s: "A" }, { s: "sin" }, { s: "(" }, { s: "x" }, { s: ")" }];
  const B: Tok[] = [{ s: "y" }, { s: "=" }, { s: "A" }, { s: "sin" }, { s: "(" }, { s: "x" }, { s: "−" }, { s: "t" }, { s: ")" }];

  it("lays tokens left to right, measured, brackets tight", () => {
    const { items, width } = layoutTokens(A, 20, measure);
    expect(items[0].x).toBe(0);
    expect(items[1].x).toBeCloseTo(10 + 20 * 0.22, 9);
    for (let i = 1; i < items.length; i++) expect(items[i].x).toBeGreaterThanOrEqual(items[i - 1].x + items[i - 1].w);
    const open = items[4];
    expect(items[5].x - (open.x + open.w)).toBeCloseTo(20 * 0.04, 9);
    expect(width).toBeCloseTo(items[6].x + items[6].w, 9);
  });

  it("keys repeated tokens by their count, raises superscripts", () => {
    const { items } = layoutTokens([{ s: "x" }, { s: "2", sup: true }, { s: "+" }, { s: "x" }], 20, measure);
    expect(items.map((i) => i.k)).toEqual(["x", "2", "+", "x#2"]);
    expect(items[1].fs).toBe(12);
    expect(items[1].y).toBeLessThan(0);
  });

  it("builds token by token, 3 frames apart", () => {
    const f = formulaState([A], [0], 4, 20, measure);
    expect(f[0].o).toBeGreaterThan(0);
    expect(f[1].o).toBeGreaterThan(0);
    expect(f[2].o).toBe(0);
    expect(formulaState([A], [0], 60, 20, measure).every((x) => x.o === 1 && x.y === layoutTokens(A, 20, measure).items.find((i) => i.k === x.id)!.y)).toBe(true);
  });

  it("moves matching tokens to their new measured places, fades in the new ones", () => {
    const end = formulaState([A, B], [0, 50], 50 + 21, 20, measure);
    const lay = layoutTokens(B, 20, measure);
    for (const it of lay.items) {
      const got = end.find((x) => x.id === it.k)!;
      expect(got.x).toBeCloseTo(it.x - lay.width / 2, 6);
      expect(got.o).toBe(1);
    }
    // Mid-move, "x" sits between its old and new places; "t" is not yet fully in.
    const mid = formulaState([A, B], [0, 50], 60, 20, measure);
    const xa = layoutTokens(A, 20, measure);
    const oldX = xa.items[5].x - xa.width / 2;
    const newX = lay.items[5].x - lay.width / 2;
    const x = mid.find((m) => m.id === "x")!.x;
    expect(x).toBeGreaterThan(Math.min(oldX, newX));
    expect(x).toBeLessThan(Math.max(oldX, newX));
    expect(mid.find((m) => m.id === "t")!.o).toBeLessThan(1);
    // Back to A: the removed "−" and "t" fade out and are gone at the end.
    const back = formulaState([A, B, A], [0, 50, 100], 125, 20, measure);
    expect(back.find((m) => m.id.startsWith("t"))).toBeUndefined();
  });

  it("renders each variable in its one colour", () => {
    vi.stubGlobal("document", { createElement: () => ({ getContext: () => null }) });
    const out = html(<FormulaSteps t={100} steps={[A]} at={[0]} size={40} font="Newsreader" ink="#eee" colors={{ x: "#7fb2d9" }} />);
    vi.unstubAllGlobals();
    expect(out).toMatch(/color:#7fb2d9[^>]*>x</);
    expect(out).toMatch(/color:#eee[^>]*>y</);
  });
});

describe("morph", () => {
  const square = "M100 100 L300 100 L300 300 L100 300 Z";
  const tri = "M200 80 L320 300 L80 300 Z";
  const sq: [number, number][] = [[100, 100], [300, 100], [300, 300], [100, 300]];
  const tr: [number, number][] = [[200, 80], [320, 300], [80, 300]];

  it("flattens path data, curves included", () => {
    expect(flatten(square)).toEqual({ pts: sq, closed: true });
    const q = flatten("M0 0 Q50 100 100 0");
    expect(q.closed).toBe(false);
    expect(q.pts[q.pts.length - 1][0]).toBeCloseTo(100, 6);
    expect(Math.max(...q.pts.map((p) => p[1]))).toBeCloseTo(50, 0);
    expect(flatten("m10 10 h20 v20 h-20 z").pts).toEqual([[10, 10], [30, 10], [30, 30], [10, 30]]);
  });

  it("resamples by arc length, evenly", () => {
    const r = resample({ pts: sq, closed: true }, 8);
    expect(r).toHaveLength(8);
    expect(r[1]).toEqual([200, 100]);
    expect(r[2]).toEqual([300, 100]);
  });

  it("starts exactly on the source path and ends exactly on the target", () => {
    const a = morphPoints(square, tri, 0);
    const b = morphPoints(square, tri, 1);
    expect(a).toHaveLength(200);
    expect(Math.max(...a.map((p) => toEdge(p, sq)))).toBeLessThan(1e-6);
    expect(Math.max(...b.map((p) => toEdge(p, tr)))).toBeLessThan(1e-6);
    // Spinning still lands on both ends.
    expect(Math.max(...morphPoints(square, tri, 1, 200, 90).map((p) => toEdge(p, tr)))).toBeLessThan(1e-6);
    expect(Math.max(...morphPoints(square, tri, 0, 200, 90).map((p) => toEdge(p, sq)))).toBeLessThan(1e-6);
  });

  it("lines the start points up: no point crosses the shape on the way", () => {
    const a = morphPoints(square, "M300 100 L300 300 L100 300 L100 100 Z", 0);
    const b = morphPoints(square, "M300 100 L300 300 L100 300 L100 100 Z", 1);
    // The same square drawn from another corner: every point stays put.
    expect(Math.max(...a.map((p, i) => Math.hypot(p[0] - b[i][0], p[1] - b[i][1])))).toBeLessThan(1e-6);
  });

  it("morphs a closed loop into an open wave, ends on the wave", () => {
    const wave = `M100 200 ${Array.from({ length: 40 }, (_, i) => `L${100 + (i + 1) * 5} ${200 - 50 * Math.sin(((i + 1) / 40) * Math.PI * 2)}`).join(" ")}`;
    const end = morphPoints("M200 100 L300 200 L200 300 L100 200 Z", wave, 1);
    const xs = end.map((p) => p[0]);
    expect(Math.min(...xs)).toBeCloseTo(100, 6);
    expect(Math.max(...xs)).toBeCloseTo(300, 6);
  });
});
