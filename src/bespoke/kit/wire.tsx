import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { inOut, prog } from "./motion";

/**
 * Lines that connect things, measured instead of guessed. Wrap each end in
 * <Anchor name>, then <Wire from to> draws from the edge of one to the edge
 * of the other, read from their real layout on every frame: a rule between
 * two logos, a drop from a label to a box, a dot riding the line. Pieces
 * placed at separately guessed coordinates miss each other by a few pixels;
 * these cannot.
 */

type Box = { x: number; y: number; w: number; h: number };
type Pt = { x: number; y: number };

/** @internal Where the line from a box's centre toward a point leaves the box, `gap` px beyond its edge. */
export function edgePoint(b: Box, toward: Pt, gap = 0): Pt {
  const cx = b.x + b.w / 2;
  const cy = b.y + b.h / 2;
  const dx = toward.x - cx;
  const dy = toward.y - cy;
  if (!dx && !dy) return { x: cx, y: cy };
  const t = Math.min(dx ? b.w / 2 / Math.abs(dx) : Infinity, dy ? b.h / 2 / Math.abs(dy) : Infinity);
  const len = Math.hypot(dx, dy);
  const k = t + gap / len;
  return { x: cx + dx * k, y: cy + dy * k };
}

/** @internal The points of a wire between two boxes: straight, or an elbow (along x first, then y). */
export function wirePoints(a: Box, b: Box, elbow: boolean, gap: number): Pt[] {
  const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 };
  const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  if (!elbow) return [edgePoint(a, cb, gap), edgePoint(b, ca, gap)];
  const corner = { x: cb.x, y: ca.y };
  return [edgePoint(a, corner, gap), corner, edgePoint(b, corner, gap)];
}

/** An element a <Wire> can connect to, by name, within the same station. */
export const Anchor = ({ name, style, children }: { name: string; style?: CSSProperties; children: ReactNode }) => (
  <div data-anchor={name} style={{ display: "inline-block", ...style }}>
    {children}
  </div>
);

/** An element's layout box relative to `root`, by its offsets (unaffected by transforms around it). */
function boxIn(el: HTMLElement, root: HTMLElement): Box | null {
  let x = 0;
  let y = 0;
  let n: HTMLElement | null = el;
  while (n && n !== root) {
    x += n.offsetLeft;
    y += n.offsetTop;
    n = n.offsetParent as HTMLElement | null;
  }
  return n === root ? { x, y, w: el.offsetWidth, h: el.offsetHeight } : null;
}

export const Wire = ({
  from,
  to,
  at,
  dur = 18,
  color = "currentColor",
  width = 3,
  gap = 12,
  elbow = false,
  dot,
  dotAt,
}: {
  /** The names of two <Anchor>s in the same station. */
  from: string;
  to: string;
  /** Frame the line starts drawing, and how many frames it takes. */
  at: number;
  dur?: number;
  color?: string;
  width?: number;
  /** Space between each end and its element, px. */
  gap?: number;
  /** Along x first, then y (a rule that turns down to a box), instead of straight. */
  elbow?: boolean;
  /** A dot on the line: its colour. It sits at `dotAt` (0..1 along the line), or rides the drawing end. */
  dot?: string;
  dotAt?: number;
}) => {
  const t = useCurrentFrame();
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const host = wrap.current;
    const c = canvas.current;
    const root = host?.offsetParent as HTMLElement | null;
    const ctx = c?.getContext("2d");
    if (!host || !c || !root || !ctx) return;
    const W = root.offsetWidth;
    const H = root.offsetHeight;
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    ctx.clearRect(0, 0, W, H);
    const a = root.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(from)}"]`);
    const b = root.querySelector<HTMLElement>(`[data-anchor="${CSS.escape(to)}"]`);
    const ba = a && boxIn(a, root);
    const bb = b && boxIn(b, root);
    const p = prog(t, at, at + dur, inOut);
    if (!ba || !bb || p <= 0) return;
    const pts = wirePoints(ba, bb, elbow, gap);
    const segs = pts.slice(1).map((q, i) => Math.hypot(q.x - pts[i].x, q.y - pts[i].y));
    const total = segs.reduce((s, l) => s + l, 0);
    // The point at fraction u along the whole line.
    const along = (u: number): Pt => {
      let left = u * total;
      for (let i = 0; i < segs.length; i++) {
        if (left <= segs[i] || i === segs.length - 1) {
          const k = segs[i] ? Math.min(1, left / segs[i]) : 0;
          return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * k, y: pts[i].y + (pts[i + 1].y - pts[i].y) * k };
        }
        left -= segs[i];
      }
      return pts[pts.length - 1];
    };
    ctx.strokeStyle = color === "currentColor" ? getComputedStyle(host).color : color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    let drawn = 0;
    for (let i = 0; i < segs.length; i++) {
      const end = drawn + segs[i];
      if (end <= p * total) ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
      else {
        const q = along(p);
        ctx.lineTo(q.x, q.y);
        break;
      }
      drawn = end;
    }
    ctx.stroke();
    if (dot) {
      const q = along(dotAt ?? p);
      ctx.fillStyle = dot;
      ctx.beginPath();
      ctx.arc(q.x, q.y, width * 2.4, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return (
    <div ref={wrap} style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <canvas ref={canvas} style={{ position: "absolute", left: 0, top: 0 }} />
    </div>
  );
};
