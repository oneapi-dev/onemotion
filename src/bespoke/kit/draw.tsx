import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { useCurrentFrame } from "remotion";
import { useFilm } from "./film";
import { inOut, prog, seeded } from "./motion";

/**
 * Drawing on a canvas: the cheap way to put many shapes, lines and particles
 * on screen. The browser exporter copies a canvas as one image, while every
 * inline <svg> is rasterized again on every frame.
 */

/** A canvas you draw on every frame: `draw(ctx, t)` gets a cleared context in composition pixels. */
export const Draw = ({ draw, width, height, style }: { draw: (ctx: CanvasRenderingContext2D, t: number) => void; width?: number; height?: number; style?: CSSProperties }) => {
  const film = useFilm();
  const t = useCurrentFrame();
  const ref = useRef<HTMLCanvasElement>(null);
  const w = Math.round(width ?? film.W);
  const h = Math.round(height ?? film.H);
  useLayoutEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    draw(ctx, t);
    ctx.restore();
  });
  return <canvas ref={ref} width={w} height={h} style={{ position: "absolute", left: 0, top: 0, width: w, height: h, pointerEvents: "none", ...style }} />;
};

// ----------------------------------------------------------------- paths

type Sampled = { pts: [number, number][]; len: number };
const sampled = new Map<string, Sampled>();
const STEP = 4;

/** Points every few px along SVG path data, measured once per path. */
export function samplePath(d: string): Sampled {
  const hit = sampled.get(d);
  if (hit) return hit;
  const el = document.createElementNS("http://www.w3.org/2000/svg", "path");
  el.setAttribute("d", d);
  let len = 0;
  try {
    len = el.getTotalLength();
  } catch {
    len = 0;
  }
  const n = Math.max(2, Math.ceil(len / STEP) + 1);
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const p = el.getPointAtLength((len * i) / (n - 1));
    pts.push([p.x, p.y]);
  }
  const out = { pts, len };
  sampled.set(d, out);
  return out;
}

/** The point at fraction u (0..1) along a path, and the direction it heads there (radians). Use it to move things along a drawn line. */
export function pointAt(d: string, u: number): { x: number; y: number; angle: number } {
  const { pts } = samplePath(d);
  const f = Math.max(0, Math.min(1, u)) * (pts.length - 1);
  const i = Math.min(pts.length - 2, Math.floor(f));
  const k = f - i;
  const [x0, y0] = pts[i];
  const [x1, y1] = pts[i + 1];
  return { x: x0 + (x1 - x0) * k, y: y0 + (y1 - y0) * k, angle: Math.atan2(y1 - y0, x1 - x0) };
}

// Path data for common marks. Shapes overshoot their start a little, the way a pen closes a loop.
export const path = {
  line: (x1: number, y1: number, x2: number, y2: number) => `M${x1} ${y1} L${x2} ${y2}`,
  /** A curve from one point to another, bowed sideways by `bend` px (negative bows the other way). */
  curve: (x1: number, y1: number, x2: number, y2: number, bend = 80) => {
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const dx = x2 - x1;
    const dy = y2 - y1;
    const L = Math.hypot(dx, dy) || 1;
    return `M${x1} ${y1} Q${mx - (dy / L) * bend} ${my + (dx / L) * bend} ${x2} ${y2}`;
  },
  polyline: (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" "),
  rect: (x: number, y: number, w: number, h: number, r = 0) => {
    const o = Math.min(14, w * 0.04);
    if (!r) return `M${x - o} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} L${x} ${y - o}`;
    const q = Math.min(r, w / 2, h / 2);
    return `M${x + q} ${y} L${x + w - q} ${y} Q${x + w} ${y} ${x + w} ${y + q} L${x + w} ${y + h - q} Q${x + w} ${y + h} ${x + w - q} ${y + h} L${x + q} ${y + h} Q${x} ${y + h} ${x} ${y + h - q} L${x} ${y + q} Q${x} ${y} ${x + q} ${y} L${x + q + o} ${y}`;
  },
  /** An ellipse drawn as a loop that runs a little past where it began. */
  ellipse: (cx: number, cy: number, rx: number, ry = rx) => {
    const n = 48;
    const pts: string[] = [];
    for (let i = 0; i <= n * 1.08; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      pts.push(`${i ? "L" : "M"}${(cx + Math.cos(a) * rx).toFixed(1)} ${(cy + Math.sin(a) * ry).toFixed(1)}`);
    }
    return pts.join(" ");
  },
};

// ------------------------------------------------------------------ ink

export type Stroke = {
  /** SVG path data, in the canvas's pixels (see `path` for helpers). */
  d: string;
  /** Frame the pen starts, and how many frames it takes. */
  at: number;
  dur?: number;
  color?: string;
  width?: number;
  /** Hand wobble in px (0 = a clean vector line). Default 1.6. */
  rough?: number;
  seed?: number;
  /** An arrowhead that rides the tip of the line. */
  arrow?: boolean;
  /** Fill the closed shape once the outline is drawn. */
  fill?: string;
  opacity?: number;
  dash?: number[];
  /** Frame from which the line un-draws from its start, and how long that takes. */
  erase?: number;
  eraseDur?: number;
};

const wobble = (s: number, seed: number) => Math.sin(s / 41 + seeded(seed) * 6.28) * 0.6 + Math.sin(s / 13 + seeded(seed + 7) * 6.28) * 0.4;

function ink(ctx: CanvasRenderingContext2D, st: Stroke, t: number) {
  const dur = st.dur ?? 18;
  const p = prog(t, st.at, st.at + dur, inOut);
  if (p <= 0) return;
  const gone = st.erase !== undefined ? prog(t, st.erase, st.erase + (st.eraseDur ?? dur), inOut) : 0;
  if (gone >= 1) return;
  const { pts } = samplePath(st.d);
  const rough = st.rough ?? 1.6;
  const seed = st.seed ?? st.d.length;
  const width = st.width ?? 5;
  const color = st.color ?? "#111";
  ctx.save();
  ctx.globalAlpha = st.opacity ?? 1;
  if (st.fill && p >= 1) {
    ctx.globalAlpha = (st.opacity ?? 1) * prog(t, st.at + dur, st.at + dur + 10) * (1 - gone);
    ctx.fillStyle = st.fill;
    ctx.fill(new Path2D(st.d));
    ctx.globalAlpha = st.opacity ?? 1;
  }
  const from = Math.floor(gone * (pts.length - 1));
  const to = Math.max(from + 1, Math.round(p * (pts.length - 1)));
  const at = (i: number): [number, number] => {
    const [x, y] = pts[i];
    if (!rough) return [x, y];
    const [ax, ay] = pts[Math.max(0, i - 1)];
    const [bx, by] = pts[Math.min(pts.length - 1, i + 1)];
    const dx = bx - ax;
    const dy = by - ay;
    const L = Math.hypot(dx, dy) || 1;
    const w = wobble(i * STEP, seed) * rough;
    return [x - (dy / L) * w, y + (dx / L) * w];
  };
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (st.dash) ctx.setLineDash(st.dash);
  ctx.beginPath();
  const [x0, y0] = at(from);
  ctx.moveTo(x0, y0);
  for (let i = from + 1; i <= to; i++) {
    const [x, y] = at(i);
    ctx.lineTo(x, y);
  }
  ctx.stroke();
  if (st.arrow && to > from + 1) {
    const [tx, ty] = at(to);
    const [bx, by] = at(Math.max(from, to - 4));
    const a = Math.atan2(ty - by, tx - bx);
    const s = Math.max(14, width * 3.6);
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(tx + Math.cos(a + Math.PI - 0.5) * s, ty + Math.sin(a + Math.PI - 0.5) * s);
    ctx.lineTo(tx, ty);
    ctx.lineTo(tx + Math.cos(a + Math.PI + 0.5) * s, ty + Math.sin(a + Math.PI + 0.5) * s);
    ctx.stroke();
  }
  ctx.restore();
}

/** Hand-drawn lines that draw themselves on: diagrams, arrows, circles around things, underlines, routes. */
export const Ink = ({ strokes, width, height, style }: { strokes: Stroke[]; width?: number; height?: number; style?: CSSProperties }) => (
  <Draw
    width={width}
    height={height}
    style={style}
    draw={(ctx, t) => {
      for (const s of strokes) ink(ctx, s, t);
    }}
  />
);
