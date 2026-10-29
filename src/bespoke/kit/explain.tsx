// Explainer blocks: a pen that draws an explanation on a board one thing at
// a time (<Pen>, the Whiteboard look), and a diagram of how parts connect,
// lit up step by step (<Flow>, the Living diagram look). Timings follow the
// manim / whiteboard-scribe study: near-linear strokes with soft ends, a pen
// that lifts and hops between strokes, holds after each element; nodes, then
// edges, then labels; focus dims the rest to 0.35; a pulse rides the active
// path. Every value is a pure function of the frame (no refs read back, no
// state), so a still render of any frame is exact.
import type { CSSProperties } from "react";
import { Draw, samplePath } from "./draw";
import { arriveE, clamp01, inOut, mix, outE, prog, seeded } from "./motion";
import { textW } from "./text";
import { wirePoints } from "./wire";

// ------------------------------------------------------------------ pen math

/**
 * Progress 0..1 of a stroke `x` frames into a draw of `dur` frames: constant
 * speed, with the speed ramping up over the first `soft` frames and down over
 * the last (a trapezoid). An inOut ease would make the nib lurch mid-stroke.
 */
export function softDraw(x: number, dur: number, soft = 3): number {
  if (x <= 0 || dur <= 0) return x >= dur ? 1 : 0;
  if (x >= dur) return 1;
  const e = Math.min(soft, dur / 2);
  if (e <= 0) return x / dur;
  const v = 1 / (dur - e);
  if (x < e) return (v * x * x) / (2 * e);
  if (x > dur - e) return 1 - (v * (dur - x) ** 2) / (2 * e);
  return v * (x - e / 2);
}

const wobble = (s: number, seed: number) => Math.sin(s / 41 + seeded(seed) * 6.28) * 0.6 + Math.sin(s / 13 + seeded(seed + 7) * 6.28) * 0.4;

/** The hand-wobbled sample `i` of a path's points. */
function bent(pts: [number, number][], step: number, i: number, rough: number, seed: number): [number, number] {
  const [x, y] = pts[i];
  if (!rough) return [x, y];
  const [ax, ay] = pts[Math.max(0, i - 1)];
  const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
  const dx = bx - ax;
  const dy = by - ay;
  const L = Math.hypot(dx, dy) || 1;
  const w = wobble(i * step, seed) * rough;
  return [x - (dy / L) * w, y + (dx / L) * w];
}

/**
 * The drawn part of a path at progress p (0..1) as points, wobbled by `rough`
 * px. Its last point is the exact tip (between samples, not rounded to one),
 * which is where <Pen> puts the nib.
 */
export function inkLine(d: string, p: number, rough = 0.7, seed = d.length): [number, number][] {
  if (p <= 0) return [];
  const { pts, len } = samplePath(d);
  const step = len / Math.max(1, pts.length - 1);
  const f = clamp01(p) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  const out: [number, number][] = [];
  for (let j = 0; j <= i; j++) out.push(bent(pts, step, j, rough, seed));
  const a = bent(pts, step, i, rough, seed);
  const b = bent(pts, step, i + 1, rough, seed);
  out.push([a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k]);
  return out;
}

/** The tip of the drawn part of a path at progress p: the last point of inkLine(). */
export function inkTip(d: string, p: number, rough = 0.7, seed = d.length): { x: number; y: number } {
  const { pts, len } = samplePath(d);
  const step = len / Math.max(1, pts.length - 1);
  const f = clamp01(p) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  const a = bent(pts, step, i, rough, seed);
  const b = bent(pts, step, Math.min(pts.length - 1, i + 1), rough, seed);
  return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k };
}

// ------------------------------------------------------------------ pen plan

/** Words the pen writes: a sweep left to right, the nib riding the edge of the writing. */
export type PenLabel = {
  text: string;
  /** Where it sits, in the board's px: x is its left edge (or centre, or right edge, by `align`), y the middle of the line. */
  x: number;
  y: number;
  size?: number;
  color?: string;
  align?: "left" | "center" | "right";
  /** Frames the writing takes (default about 1.8 a letter, 8 to 36). */
  dur?: number;
};

export type PenStroke = {
  /** SVG path data in the board's px (see `path`). Leave it out for words alone: the pen just writes the label. */
  d?: string;
  color?: string;
  width?: number;
  /** Fill the closed shape: fades in over `fillDur` frames once its outline is drawn. */
  fill?: string;
  /** Words written after the outline (the pen hops there first). */
  label?: PenLabel;
  /** Frames the outline takes (default its length / speed, 8 to 90). */
  dur?: number;
  /** Frames the pen rests after this element before hopping on (default the Pen's `hold`); 0 for strokes of one element (an arrow's shaft, then its head). */
  hold?: number;
  dash?: number[];
  opacity?: number;
};

/** When each element of a <Pen> draws, in the frames of `t`. */
export type PenTime = {
  /** The outline: first frame and the frame it is complete. */
  start: number;
  end: number;
  /** The fill fading in, or null. */
  fill: [number, number] | null;
  /** The label being written, or null. */
  label: [number, number] | null;
  /** The frame the element is finished (its label written). */
  done: number;
};

export type PenOptions = {
  at: number;
  speed?: number;
  hop?: number;
  fade?: number;
  hold?: number;
  fillDur?: number;
  labelSize?: number;
  /** The width of a label's text in px (the Pen measures it in its font). */
  measure?: (label: PenLabel, size: number) => number;
};

type PenSeg = { a: number; b: number; i: number; kind: "stroke" | "label" };

export type PenPlan = {
  times: PenTime[];
  /** @internal Every draw in order: an outline or a label. */
  segs: PenSeg[];
  /** The frame the pen starts arriving, the frame the last element is finished, and the frame the pen is gone. */
  in: number;
  end: number;
  out: number;
};

const labelDur = (l: PenLabel) => l.dur ?? Math.max(8, Math.min(36, Math.round([...l.text].length * 1.8)));
const strokeDur = (s: PenStroke, speed: number) => (s.d ? (s.dur ?? Math.max(8, Math.min(90, Math.round(samplePath(s.d).len / speed)))) : 0);

/**
 * When each stroke of a <Pen> starts and ends, from the same options as the
 * Pen: time words, sounds or other things to them ("the circle closes as the
 * voice says peak"). Elements draw one after another, the pen hopping `hop`
 * frames between draws and resting `hold` frames after each element.
 */
export function penTimes(strokes: PenStroke[], { at, speed = 30, hop = 7, fade = 4, hold = 18, fillDur = 12 }: PenOptions): PenPlan {
  const times: PenTime[] = [];
  const segs: PenSeg[] = [];
  let c = at;
  strokes.forEach((s, i) => {
    if (i > 0) c += hop;
    const start = c;
    const end = start + strokeDur(s, speed);
    if (s.d) segs.push({ a: start, b: end, i, kind: "stroke" });
    c = end;
    let label: [number, number] | null = null;
    if (s.label) {
      if (s.d) c += hop;
      label = [c, c + labelDur(s.label)];
      segs.push({ a: label[0], b: label[1], i, kind: "label" });
      c = label[1];
    }
    times.push({ start, end, fill: s.fill && s.d ? [end, end + fillDur] : null, label, done: c });
    if (i < strokes.length - 1) c += s.hold ?? hold;
  });
  const end = times.length ? times[times.length - 1].done : at;
  return { times, segs, in: at - hop, end, out: end + fade };
}

/** Where a label's writing line runs: its left and right ends and the baseline, in board px. */
function labelLine(l: PenLabel, size: number, measure: (l: PenLabel, size: number) => number) {
  const w = measure(l, size);
  const x0 = l.align === "center" ? l.x - w / 2 : l.align === "right" ? l.x - w : l.x;
  return { x0, x1: x0 + w, y: l.y + size * 0.28, w };
}

const estimate = (l: PenLabel, size: number) => [...l.text].length * size * 0.45;

/**
 * The pen at frame t: the nib's point on the board, how far it is lifted
 * (0 on the board, 1 lifted) and its opacity. While a stroke draws, the nib is
 * the stroke's exact tip.
 */
/** The pen at a frame: the nib's point, how lifted it is, its opacity, and which element's draw it is on (or heading to). */
export type PenAt = { x: number; y: number; up: number; alpha: number; i: number; kind: "stroke" | "label" };

export function penAt(plan: PenPlan, strokes: PenStroke[], t: number, opts: Pick<PenOptions, "labelSize" | "measure" | "fade" | "hop"> & { rough?: number } = {}): PenAt {
  const { labelSize = 48, measure = estimate, fade = 4, hop = 7, rough = 0.7 } = opts;
  const { segs } = plan;
  if (!segs.length) return { x: 0, y: 0, up: 1, alpha: 0, i: 0, kind: "stroke" };
  const point = (seg: PenSeg, u: number) => {
    const s = strokes[seg.i];
    if (seg.kind === "stroke" && s.d) return inkTip(s.d, u, rough);
    const l = s.label as PenLabel;
    const size = l.size ?? labelSize;
    const line = labelLine(l, size, measure);
    // The nib bobs a little as it writes, a few strokes a letter.
    const bob = u > 0 && u < 1 ? Math.sin(u * [...l.text].length * Math.PI * 1.5) * size * 0.08 : 0;
    return { x: line.x0 + line.w * u, y: line.y - Math.abs(bob) };
  };
  const first = segs[0];
  const last = segs[segs.length - 1];
  if (t < first.a) {
    const p = point(first, 0);
    return { ...p, up: 1 - prog(t, plan.in, first.a, inOut), alpha: prog(t, plan.in, plan.in + fade, inOut), i: first.i, kind: first.kind };
  }
  if (t >= last.b) {
    const p = point(last, 1);
    return { ...p, up: prog(t, last.b, last.b + fade, inOut), alpha: 1 - prog(t, last.b, last.b + fade, inOut), i: last.i, kind: last.kind };
  }
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k];
    if (t >= s.a && t < s.b) return { ...point(s, softDraw(t - s.a, s.b - s.a)), up: 0, alpha: 1, i: s.i, kind: s.kind };
    const next = segs[k + 1];
    if (next && t >= s.b && t < next.a) {
      // The gap: rest at the end (lifted a little), then hop to the next start.
      const hopFrom = Math.max(s.b, next.a - hop);
      const h = prog(t, hopFrom, next.a, inOut);
      const from = point(s, 1);
      const to = point(next, 0);
      const r = Math.min(4, (next.a - s.b) / 2);
      const up = Math.min(prog(t, s.b, s.b + r, inOut), 1 - prog(t, next.a - r, next.a, inOut));
      const toward = h < 0.5 ? s : next;
      return { x: mix(from.x, to.x, h), y: mix(from.y, to.y, h), up, alpha: 1, i: toward.i, kind: toward.kind };
    }
  }
  return { ...point(last, 1), up: 1, alpha: 1, i: last.i, kind: last.kind };
}

// ------------------------------------------------------------------ pen

/** The hand: a marker or a pencil, tip at (0, 0), leaning up and to the right. Simple vector, no clip-art. */
const Hand = ({ kind, x, y, up, alpha, color, scale }: { kind: "marker" | "pencil"; x: number; y: number; up: number; alpha: number; color: string; scale: number }) => {
  const lift = { x: 6 * up * scale, y: -16 * up * scale };
  const shadow = { x: (10 + 14 * up) * scale, y: (12 + 18 * up) * scale };
  const body =
    kind === "marker" ? (
      <>
        <rect x={-21} y={-250} width={42} height={212} rx={10} fill="#F1F1EE" stroke="#2A2A2A" strokeWidth={2.5} />
        <rect x={-21} y={-250} width={42} height={50} rx={10} fill={color} />
        <rect x={-12} y={-190} width={5} height={130} rx={2.5} fill="#FFFFFF" opacity={0.8} />
        <rect x={-16} y={-41} width={32} height={19} rx={3} fill="#2A2A2A" />
        <path d="M-9 -22 L9 -22 L5 -3 L-5 -3 Z" fill={color} />
      </>
    ) : (
      <>
        <rect x={-13} y={-300} width={26} height={252} rx={3} fill="#D8D4CB" stroke="#2A2A2A" strokeWidth={2} />
        <rect x={-13} y={-300} width={26} height={26} rx={3} fill="#B9B2A3" stroke="#2A2A2A" strokeWidth={2} />
        <path d="M-13 -48 L13 -48 L4 -12 L-4 -12 Z" fill="#E8D7B2" stroke="#2A2A2A" strokeWidth={2} strokeLinejoin="round" />
        <path d="M-4 -12 L4 -12 L0 -1 Z" fill={color} />
      </>
    );
  const silhouette = kind === "marker" ? <rect x={-21} y={-250} width={42} height={228} rx={10} /> : <path d="M-13 -300 L13 -300 L13 -48 L0 -1 L-13 -48 Z" />;
  return (
    <svg width={1} height={1} style={{ position: "absolute", left: x, top: y, overflow: "visible", opacity: alpha, pointerEvents: "none" }}>
      <g transform={`translate(${shadow.x} ${shadow.y}) scale(${scale}) rotate(38)`} fill="#000" opacity={0.1 * (1 - 0.5 * up)}>
        {silhouette}
      </g>
      <g transform={`translate(${lift.x} ${lift.y}) scale(${scale}) rotate(38)`}>{body}</g>
    </svg>
  );
};

/**
 * A pen that draws an explanation on a board, one element at a time: each
 * element's outline (the nib riding its tip), then its fill, then its label,
 * a rest, a hop to the next. Coordinates are the board's px (0..w, 0..h).
 */
export const Pen = ({
  t,
  at,
  strokes,
  w,
  h,
  speed = 30,
  hand = "marker",
  hop = 7,
  fade = 4,
  hold = 18,
  fillDur = 12,
  color = "#151515",
  width = 6,
  rough = 0.7,
  font = "Caveat",
  weight = 600,
  labelSize = 48,
  labelColor,
  handScale,
  style,
}: {
  /** The frame (useCurrentFrame()). */
  t: number;
  /** The frame the first stroke starts (the pen arrives `hop` frames before). */
  at: number;
  strokes: PenStroke[];
  /** The board's size in px. */
  w: number;
  h: number;
  /** Drawing speed in px a frame, for strokes without their own `dur`. */
  speed?: number;
  hand?: "marker" | "pencil" | "none";
  hop?: number;
  fade?: number;
  hold?: number;
  fillDur?: number;
  /** The default ink colour and line width of strokes. */
  color?: string;
  width?: number;
  /** Hand wobble in px (0 = clean vector lines). */
  rough?: number;
  /** The handwriting face and weight of labels, and their default size and colour. */
  font?: string;
  weight?: number;
  labelSize?: number;
  labelColor?: string;
  /** The hand's size (default scaled to a 1920 px board). */
  handScale?: number;
  style?: CSSProperties;
}) => {
  const measure = (l: PenLabel, size: number) => textW(l.text, font, weight, size);
  const plan = penTimes(strokes, { at, speed, hop, fade, hold, fillDur });
  const nib = penAt(plan, strokes, t, { labelSize, measure, fade, hop, rough });
  // The marker in hand is the colour of what it is drawing.
  const held = strokes[nib.i];
  const nibColor = (nib.kind === "label" ? (held?.label?.color ?? labelColor) : undefined) ?? held?.color ?? color;
  return (
    <div style={{ position: "relative", width: w, height: h, flexShrink: 0, ...style }}>
      <Draw
        width={w}
        height={h}
        draw={(ctx) => {
          strokes.forEach((s, i) => {
            const tm = plan.times[i];
            if (!s.d || t < tm.start) return;
            const base = s.opacity ?? 1;
            ctx.save();
            if (s.fill && tm.fill) {
              const a = prog(t, tm.fill[0], tm.fill[1], outE);
              if (a > 0) {
                ctx.globalAlpha = base * a;
                ctx.fillStyle = s.fill;
                ctx.fill(new Path2D(s.d));
              }
            }
            const pts = inkLine(s.d, softDraw(t - tm.start, tm.end - tm.start), rough);
            if (pts.length > 1) {
              ctx.globalAlpha = base;
              ctx.strokeStyle = s.color ?? color;
              ctx.lineWidth = s.width ?? width;
              ctx.lineCap = "round";
              ctx.lineJoin = "round";
              if (s.dash) ctx.setLineDash(s.dash);
              ctx.beginPath();
              ctx.moveTo(pts[0][0], pts[0][1]);
              for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
              ctx.stroke();
            }
            ctx.restore();
          });
        }}
      />
      {strokes.map((s, i) => {
        const l = s.label;
        const span = plan.times[i].label;
        if (!l || !span || t < span[0]) return null;
        const size = l.size ?? labelSize;
        const u = softDraw(t - span[0], span[1] - span[0]);
        const shift = l.align === "center" ? "-50%" : l.align === "right" ? "-100%" : "0%";
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: l.x,
              top: l.y,
              transform: `translate(${shift}, -50%)`,
              fontFamily: font,
              fontWeight: weight,
              fontSize: size,
              lineHeight: 1.25,
              padding: "0.12em 0",
              whiteSpace: "nowrap",
              color: l.color ?? labelColor ?? s.color ?? color,
              clipPath: u >= 1 ? undefined : `inset(0 ${((1 - u) * 100).toFixed(2)}% 0 0)`,
            }}
          >
            {l.text}
          </div>
        );
      })}
      {hand !== "none" && nib.alpha > 0 ? <Hand kind={hand} x={nib.x} y={nib.y} up={nib.up} alpha={nib.alpha} color={nibColor} scale={handScale ?? w / 1920 + 0.25} /> : null}
    </div>
  );
};

// ------------------------------------------------------------------ flow math

export type FlowNode = {
  id: string;
  label: string;
  /** A second, smaller line under the label (mono). */
  sub?: string;
  /** The node's centre in the diagram's px, and its size (default sized to the label). */
  x: number;
  y: number;
  w?: number;
  h?: number;
};

/** A connection: [from, to], or with a label on it, or drawn as an elbow (along x, then y). */
export type FlowEdge = [string, string] | { from: string; to: string; label?: string; elbow?: boolean };

/** Focus steps: from each frame, the ids lit (node ids, or "a>b" for one edge); everything else dims. [] lights everything again. */
export type FlowFocus = [number, string[]][];

export type FlowPlan = {
  /** Each node's scale-in, each edge's draw, each label's fade (node labels first, then edge labels): [first frame, last frame]. */
  nodes: [number, number][];
  edges: [number, number][];
  labels: [number, number][];
  end: number;
};

/**
 * The reveal of a <Flow>: nodes scale in one after another (`gap` frames
 * apart, 14 frames each), edges draw from 9 frames before the last node
 * lands (15 to 21 frames each, 5 apart), then the labels (10 frames, 4 apart).
 */
export function flowPlan(nodeCount: number, edgeCount: number, { at, gap = 9, labelCount = nodeCount, lengths = [] }: { at: number; gap?: number; labelCount?: number; lengths?: number[] }): FlowPlan {
  const nodes: [number, number][] = [];
  for (let i = 0; i < nodeCount; i++) nodes.push([at + i * gap, at + i * gap + 14]);
  const landed = nodes.length ? nodes[nodes.length - 1][1] : at;
  const edges: [number, number][] = [];
  const e0 = Math.max(at, landed - 9);
  const step = edgeCount > 1 ? Math.min(5, 24 / (edgeCount - 1)) : 0;
  for (let i = 0; i < edgeCount; i++) {
    const a = Math.round(e0 + i * step);
    const dur = Math.round(Math.max(15, Math.min(21, 15 + (lengths[i] ?? 360) / 120)));
    edges.push([a, a + dur]);
  }
  const drawn = edges.length ? Math.max(...edges.map((e) => e[1])) : landed;
  const l0 = Math.max(landed, drawn - 6);
  const labels: [number, number][] = [];
  for (let i = 0; i < labelCount; i++) labels.push([l0 + i * 4, l0 + i * 4 + 10]);
  const end = Math.max(drawn, labels.length ? labels[labels.length - 1][1] : 0);
  return { nodes, edges, labels, end };
}

/**
 * A value that follows the focus steps: `value(ids)` from each step's frame,
 * reached over `dur` frames with inOut, starting from wherever the previous
 * change had got to (a step that interrupts a fade does not jump).
 */
export function focusMix(t: number, focus: FlowFocus, value: (ids: string[]) => number, base: number, dur = 9): number {
  const keys = [...focus].sort((a, b) => a[0] - b[0]);
  let from = base;
  let target = base;
  let f0 = Number.NEGATIVE_INFINITY;
  for (const [f, ids] of keys) {
    if (f > t) break;
    from = f0 === Number.NEGATIVE_INFINITY ? target : mix(from, target, prog(f, f0, f0 + dur, inOut));
    target = value(ids);
    f0 = f;
  }
  return f0 === Number.NEGATIVE_INFINITY ? base : mix(from, target, prog(t, f0, f0 + dur, inOut));
}

/** How lit a part is at frame t: 1 in focus (or with nothing in focus), `dim` out of it. */
export const focusLevel = (t: number, focus: FlowFocus, isIn: (ids: string[]) => boolean, dim = 0.35, dur = 9) => focusMix(t, focus, (ids) => (!ids.length || isIn(ids) ? 1 : dim), 1, dur);

const edgeOf = (e: FlowEdge) => (Array.isArray(e) ? { from: e[0], to: e[1], label: undefined, elbow: false } : { from: e.from, to: e.to, label: e.label, elbow: e.elbow ?? false });
const edgeIn = (ids: string[], e: { from: string; to: string }) => ids.includes(`${e.from}>${e.to}`) || (ids.includes(e.from) && ids.includes(e.to));

/**
 * Where the pulse is on each edge at frame t (0..1 along it), or null: from
 * the latest focus step, a dot leaves the start of the active path and runs
 * along each active edge in `dur` frames, linear, edge after edge (branches
 * at once), then again after a `rest`.
 */
export function flowPulse(t: number, edges: FlowEdge[], focus: FlowFocus, dur = 48, rest = 12): (number | null)[] {
  const es = edges.map(edgeOf);
  const keys = [...focus].sort((a, b) => a[0] - b[0]).filter(([f]) => f <= t);
  const key = keys[keys.length - 1];
  if (!key || !key[1].length) return es.map(() => null);
  const [f0, ids] = key;
  const active = es.map((e) => edgeIn(ids, e));
  const on = es.filter((_, i) => active[i]);
  if (!on.length) return es.map(() => null);
  // Depth of each node from the path's start: sources are active edges' starts nothing active leads into.
  const depth = new Map<string, number>();
  const sources = on.filter((e) => !on.some((o) => o.to === e.from)).map((e) => e.from);
  const queue = sources.length ? sources : [on[0].from];
  for (const id of queue) depth.set(id, 0);
  while (queue.length) {
    const id = queue.shift() as string;
    for (const e of on) {
      if (e.from === id && !depth.has(e.to)) {
        depth.set(e.to, (depth.get(id) ?? 0) + 1);
        queue.push(e.to);
      }
    }
  }
  const deepest = Math.max(...on.map((e) => depth.get(e.from) ?? 0));
  const period = (deepest + 1) * dur + rest;
  const phase = (t - f0) % period;
  return es.map((e, i) => {
    if (!active[i]) return null;
    const u = (phase - (depth.get(e.from) ?? 0) * dur) / dur;
    return u > 0 && u < 1 ? u : null;
  });
}

// ------------------------------------------------------------------ flow

/**
 * A diagram of how parts connect, built step by step and lit as it is
 * explained: nodes, then edges, then labels; `focus` steps light the parts
 * being talked about and dim the rest; a pulse rides the active path. Grey
 * ink, one accent for what is active. Coordinates are the diagram's px.
 */
export const Flow = ({
  t,
  at,
  nodes,
  edges,
  focus = [],
  w,
  h,
  ink = "#8E8E89",
  text = "#1B1B1F",
  accent = "#1F6FEB",
  paper = "#FFFFFF",
  font = "Inter",
  mono = "JetBrains Mono",
  size = 34,
  line = 2.5,
  gap = 9,
  pulse = 48,
  dim = 0.35,
  arrows = true,
  style,
}: {
  /** The frame (useCurrentFrame()). */
  t: number;
  /** The frame the first node starts to appear. */
  at: number;
  nodes: FlowNode[];
  edges: FlowEdge[];
  focus?: FlowFocus;
  /** The diagram's size in px. */
  w: number;
  h: number;
  /** Lines and borders (grey), text, the one accent, and the nodes' fill. */
  ink?: string;
  text?: string;
  accent?: string;
  paper?: string;
  /** The label face and the mono face of sub-lines and edge labels; the label size in px (at least 28 at 1920). */
  font?: string;
  mono?: string;
  size?: number;
  /** Line width of edges and borders. */
  line?: number;
  /** Frames between nodes appearing (8 to 10). */
  gap?: number;
  /** Frames the pulse takes along one edge, or false for none. */
  pulse?: number | false;
  dim?: number;
  arrows?: boolean;
  style?: CSSProperties;
}) => {
  const byId = new Map<string, { n: FlowNode; box: { x: number; y: number; w: number; h: number } }>();
  for (const n of nodes) {
    const bw = n.w ?? Math.max(size * 5, textW(n.label, font, 600, size) + size * 1.6);
    const bh = n.h ?? (n.sub ? size * 2.9 : size * 2.1);
    byId.set(n.id, { n, box: { x: n.x - bw / 2, y: n.y - bh / 2, w: bw, h: bh } });
  }
  const es = edges.map((e) => {
    const { from, to, label, elbow } = edgeOf(e);
    const a = byId.get(from);
    const b = byId.get(to);
    if (!a || !b) throw new Error(`<Flow>: edge ${from} > ${to} names no node "${!a ? from : to}" (nodes: ${nodes.map((n) => n.id).join(", ")})`);
    const pts = wirePoints(a.box, b.box, elbow, line * 3 + 8);
    const segs = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
    const len = segs.reduce((s, l) => s + l, 0) || 1;
    const along = (u: number) => {
      let left = u * len;
      for (let i = 0; i < segs.length; i++) {
        if (left <= segs[i] || i === segs.length - 1) {
          const k = segs[i] ? clamp01(left / segs[i]) : 0;
          return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
        }
        left -= segs[i];
      }
      return pts[pts.length - 1];
    };
    return { from, to, label, pts, len, along, d: pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") };
  });
  const edgeLabels = es.filter((e) => e.label);
  const plan = flowPlan(nodes.length, es.length, { at, gap, labelCount: nodes.length + edgeLabels.length, lengths: es.map((e) => e.len) });
  const pulses = pulse === false ? es.map(() => null) : flowPulse(t, edges, focus, pulse);
  const head = line * 4 + 6;
  return (
    <div style={{ position: "relative", width: w, height: h, flexShrink: 0, ...style }}>
      <svg width={w} height={h} style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}>
        {es.map((e, i) => {
          const [a, b] = plan.edges[i];
          const p = prog(t, a, b, inOut);
          if (p <= 0) return null;
          const lit = focusLevel(t, focus, (ids) => edgeIn(ids, e), dim);
          const hot = focusMix(t, focus, (ids) => (ids.length && edgeIn(ids, e) ? 1 : 0), 0);
          const n = e.pts.length;
          const ang = Math.atan2(e.pts[n - 1].y - e.pts[n - 2].y, e.pts[n - 1].x - e.pts[n - 2].x);
          const tip = e.pts[n - 1];
          const arrow = `M${tip.x + Math.cos(ang + Math.PI - 0.5) * head} ${tip.y + Math.sin(ang + Math.PI - 0.5) * head} L${tip.x} ${tip.y} L${tip.x + Math.cos(ang + Math.PI + 0.5) * head} ${tip.y + Math.sin(ang + Math.PI + 0.5) * head}`;
          const arrowIn = clamp01((p - 0.85) / 0.15);
          const dot = pulses[i] !== null && p >= 1 ? e.along(pulses[i] as number) : null;
          const lineEl = (c: string, o: number) => (
            <g opacity={o}>
              <path d={e.d} fill="none" stroke={c} strokeWidth={line} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={e.len} strokeDashoffset={e.len * (1 - p)} />
              {arrows && arrowIn > 0 ? <path d={arrow} fill="none" stroke={c} strokeWidth={line} strokeLinecap="round" strokeLinejoin="round" opacity={arrowIn} /> : null}
            </g>
          );
          return (
            <g key={`${e.from}>${e.to}`} opacity={lit}>
              {lineEl(ink, 1)}
              {hot > 0 ? lineEl(accent, hot) : null}
              {dot ? <circle cx={dot.x} cy={dot.y} r={line * 2.6} fill={accent} stroke={paper} strokeWidth={line} /> : null}
            </g>
          );
        })}
      </svg>
      {nodes.map((n, i) => {
        const { box } = byId.get(n.id) as { box: { x: number; y: number; w: number; h: number } };
        const s = prog(t, plan.nodes[i][0], plan.nodes[i][1], arriveE);
        if (s <= 0) return null;
        const lit = focusLevel(t, focus, (ids) => ids.includes(n.id), dim);
        const hot = focusMix(t, focus, (ids) => (ids.length && ids.includes(n.id) ? 1 : 0), 0);
        const lp = prog(t, plan.labels[i][0], plan.labels[i][1], outE);
        const radius = Math.min(14, box.h * 0.22);
        return (
          <div
            key={n.id}
            style={{
              position: "absolute",
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              boxSizing: "border-box",
              border: `${line}px solid ${ink}`,
              borderRadius: radius,
              background: paper,
              opacity: s * lit,
              transform: `scale(${0.85 + 0.15 * s})`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: size * 0.12,
            }}
          >
            {hot > 0 ? <div style={{ position: "absolute", inset: -line, border: `${line}px solid ${accent}`, borderRadius: radius, opacity: hot }} /> : null}
            {lp > 0 ? (
              <>
                <div style={{ fontFamily: font, fontWeight: 600, fontSize: size, lineHeight: 1.1, color: text, whiteSpace: "nowrap", opacity: lp, transform: `translateY(${(1 - lp) * 8}px)` }}>{n.label}</div>
                {n.sub ? <div style={{ fontFamily: mono, fontSize: Math.max(28, size * 0.78), lineHeight: 1.1, color: text, whiteSpace: "nowrap", opacity: lp * 0.62, transform: `translateY(${(1 - lp) * 8}px)` }}>{n.sub}</div> : null}
              </>
            ) : null}
          </div>
        );
      })}
      {edgeLabels.map((e, k) => {
        const span = plan.labels[nodes.length + k];
        const lp = prog(t, span[0], span[1], outE);
        if (lp <= 0) return null;
        const mid = e.along(0.5);
        const lit = focusLevel(t, focus, (ids) => edgeIn(ids, e), dim);
        return (
          <div key={`${e.from}>${e.to}:label`} style={{ position: "absolute", left: mid.x, top: mid.y - size * 0.8, transform: `translate(-50%, -50%) translateY(${(1 - lp) * 8}px)`, fontFamily: mono, fontSize: Math.max(28, size * 0.78), color: text, whiteSpace: "nowrap", opacity: lp * lit }}>
            {e.label}
          </div>
        );
      })}
    </div>
  );
};
