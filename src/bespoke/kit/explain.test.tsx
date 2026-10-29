import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { checkScene } from "../check";
import { readExample } from "../examples";
import { Flow, flowPlan, flowPulse, focusLevel, inkLine, inkTip, penAt, penTimes, softDraw, type FlowEdge, type PenStroke } from "./explain";

vi.mock("server-only", () => ({}));

/** A stand-in for an SVG path element that measures polylines ("M x y L x y ..."), the way the browser does. */
function fakePath() {
  let pts: [number, number][] = [];
  const segs = () => pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  return {
    setAttribute: (_: string, d: string) => {
      const n = (d.match(/-?[\d.]+/g) ?? []).map(Number);
      pts = [];
      for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
    },
    getTotalLength: () => segs().reduce((s, l) => s + l, 0),
    getPointAtLength: (at: number) => {
      const ls = segs();
      let left = at;
      for (let i = 0; i < ls.length; i++) {
        if (left <= ls[i] || i === ls.length - 1) {
          const k = ls[i] ? Math.min(1, left / ls[i]) : 0;
          return { x: pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, y: pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k };
        }
        left -= ls[i];
      }
      return { x: pts[0][0], y: pts[0][1] };
    },
  };
}

beforeAll(() => {
  vi.stubGlobal("document", { createElementNS: () => fakePath(), createElement: () => ({ getContext: () => null }) });
});
afterAll(() => {
  vi.unstubAllGlobals();
});

describe("pen strokes", () => {
  it("draw at a constant speed with 3-frame soft ends, never an eased lurch", () => {
    const dur = 30;
    const v = [...Array(dur + 1).keys()].map((x) => softDraw(x, dur));
    expect(v[0]).toBe(0);
    expect(v[dur]).toBe(1);
    const steps = v.slice(1).map((p, i) => p - v[i]);
    for (const s of steps) expect(s).toBeGreaterThan(0);
    // The middle moves the same amount every frame; the first and last frames move less.
    const mid = steps.slice(4, -4);
    for (const s of mid) expect(s).toBeCloseTo(mid[0], 9);
    expect(steps[0]).toBeLessThan(mid[0] / 3);
    expect(steps[dur - 1]).toBeLessThan(mid[0] / 3);
  });

  it("keeps the nib on the tip of the line as it draws, within 1 px", () => {
    const strokes: PenStroke[] = [
      { d: "M100 100 L500 100", dur: 20 },
      { d: "M100 300 L400 300 L400 500", dur: 30 },
    ];
    const plan = penTimes(strokes, { at: 10 });
    for (const rough of [0, 0.7, 2]) {
      for (const [i, frac] of [
        [0, 0.5],
        [1, 0.3],
        [1, 0.71],
      ] as const) {
        const tm = plan.times[i];
        const t = tm.start + (tm.end - tm.start) * frac;
        const p = softDraw(t - tm.start, tm.end - tm.start);
        const nib = penAt(plan, strokes, t, { rough });
        const drawn = inkLine(strokes[i].d as string, p, rough);
        const tip = drawn[drawn.length - 1];
        expect(nib.up).toBe(0);
        expect(Math.hypot(nib.x - tip[0], nib.y - tip[1])).toBeLessThan(1);
        expect(inkTip(strokes[i].d as string, p, rough)).toEqual({ x: tip[0], y: tip[1] });
      }
    }
    // With no wobble, the tip is the true point on the path (the first line runs along y = 100).
    const t = plan.times[0].start + 7.3;
    const p = softDraw(7.3, 20);
    const nib = penAt(plan, strokes, t, { rough: 0 });
    expect(Math.abs(nib.x - (100 + 400 * p))).toBeLessThan(1);
    expect(Math.abs(nib.y - 100)).toBeLessThan(1);
  });

  it("hops between strokes, holds after each element, writes the label after the outline, and fades when done", () => {
    const strokes: PenStroke[] = [
      { d: "M0 0 L300 0", dur: 20, fill: "#eee", label: { text: "wave", x: 0, y: 40 } },
      { d: "M0 100 L300 100", dur: 10 },
    ];
    const plan = penTimes(strokes, { at: 0, hop: 7, hold: 18, fade: 4, fillDur: 12 });
    const [a, b] = plan.times;
    expect(a.start).toBe(0);
    expect(a.end).toBe(20);
    expect(a.fill).toEqual([20, 32]);
    expect(a.label?.[0]).toBe(27); // one hop after the outline
    expect(b.start).toBe(a.done + 18 + 7); // the rest, then the hop
    expect(plan.end).toBe(b.end);
    expect(plan.out).toBe(b.end + 4);
    expect(plan.in).toBe(-7);
    // Lifted between strokes, on the board while drawing, gone after the fade.
    expect(penAt(plan, strokes, b.start - 4).up).toBeGreaterThan(0.5);
    expect(penAt(plan, strokes, b.start + 5).up).toBe(0);
    expect(penAt(plan, strokes, b.start + 5).i).toBe(1);
    expect(penAt(plan, strokes, a.label![0] + 2).kind).toBe("label");
    expect(penAt(plan, strokes, plan.end).alpha).toBe(1);
    expect(penAt(plan, strokes, plan.out).alpha).toBe(0);
    expect(penAt(plan, strokes, plan.in).alpha).toBe(0);
    // A pure function of the frame: asking twice gives the same answer.
    expect(penAt(plan, strokes, 33.5)).toEqual(penAt(plan, strokes, 33.5));
  });
});

describe("flow", () => {
  it("reveals nodes, then edges from 9 frames before the last node lands, then labels", () => {
    const plan = flowPlan(5, 4, { at: 10 });
    expect(plan.nodes.map((n) => n[0])).toEqual([10, 19, 28, 37, 46]);
    for (const [a, b] of plan.nodes) expect(b - a).toBe(14);
    const landed = plan.nodes[4][1];
    expect(plan.edges[0][0]).toBe(landed - 9);
    for (const [a, b] of plan.edges) {
      expect(b - a).toBeGreaterThanOrEqual(15);
      expect(b - a).toBeLessThanOrEqual(21);
    }
    for (let i = 1; i < plan.edges.length; i++) expect(plan.edges[i][0]).toBeGreaterThan(plan.edges[i - 1][0]);
    const lastEdge = Math.max(...plan.edges.map((e) => e[1]));
    expect(plan.labels[0][0]).toBeGreaterThanOrEqual(landed);
    expect(plan.labels[0][0]).toBeLessThan(lastEdge);
    plan.labels.forEach(([a, b], i) => {
      expect(b - a).toBe(10);
      if (i) expect(a - plan.labels[i - 1][0]).toBe(4);
    });
    expect(plan.end).toBe(plan.labels[4][1]);
  });

  it("dims what is not in focus to 0.35 over 9 frames, and lights everything again on []", () => {
    const focus: [number, string[]][] = [
      [100, ["a", "b"]],
      [200, []],
    ];
    const has = (id: string) => (ids: string[]) => ids.includes(id);
    expect(focusLevel(50, focus, has("c"))).toBe(1);
    expect(focusLevel(100, focus, has("c"))).toBe(1);
    const mid = focusLevel(104.5, focus, has("c"));
    expect(mid).toBeGreaterThan(0.35);
    expect(mid).toBeLessThan(1);
    expect(focusLevel(109, focus, has("c"))).toBeCloseTo(0.35, 9);
    expect(focusLevel(150, focus, has("a"))).toBe(1);
    expect(focusLevel(209, focus, has("c"))).toBe(1);
    // A step that interrupts a fade starts from where the fade had got to.
    const quick: [number, string[]][] = [
      [100, ["a"]],
      [104, []],
    ];
    expect(focusLevel(104, quick, has("c"))).toBeCloseTo(focusLevel(103.999, quick, has("c")), 3);
  });

  it("runs the pulse along the active path, 48 frames an edge, linear, branches at once", () => {
    const edges: FlowEdge[] = [["client", "gateway"], ["gateway", "a"], ["gateway", "b"], ["x", "y"]];
    const focus: [number, string[]][] = [[100, ["client", "gateway", "a", "b"]]];
    expect(flowPulse(99, edges, focus)).toEqual([null, null, null, null]);
    expect(flowPulse(124, edges, focus)).toEqual([0.5, null, null, null]);
    expect(flowPulse(112, edges, focus)[0]).toBeCloseTo(0.25, 9);
    expect(flowPulse(100 + 48 + 12, edges, focus)).toEqual([null, 0.25, 0.25, null]);
  });

  it("renders the diagram as a pure function of the frame, labels in the page's text", () => {
    const nodes = [
      { id: "client", label: "Client", x: 150, y: 200, w: 220, h: 80 },
      { id: "gateway", label: "Gateway", x: 650, y: 200, w: 240, h: 80 },
    ];
    const props = { at: 0, nodes, edges: [["client", "gateway"]] as FlowEdge[], focus: [[60, ["client", "gateway"]]] as [number, string[]][], w: 900, h: 400 };
    const a = renderToStaticMarkup(<Flow t={90} {...props} />);
    expect(a).toBe(renderToStaticMarkup(<Flow t={90} {...props} />));
    expect(a).toContain(">Client<");
    expect(a).toContain(">Gateway<");
    expect(a).toContain("<circle"); // the pulse
    expect(renderToStaticMarkup(<Flow t={0} {...props} />)).not.toContain("Client");
    expect(() => renderToStaticMarkup(<Flow t={0} {...props} edges={[["client", "nowhere"]]} />)).toThrow(/nowhere/);
  });
});

describe("the whiteboard example", () => {
  it("passes the scene check", () => {
    vi.unstubAllGlobals();
    const ex = readExample("look-whiteboard");
    expect(ex).not.toBeNull();
    const r = checkScene(ex!.files);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  }, 60_000);
});
