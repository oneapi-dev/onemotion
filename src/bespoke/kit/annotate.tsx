import { useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { useCurrentFrame } from "remotion";
import { inOut, prog, seeded } from "./motion";

/**
 * A hand-drawn mark around what it wraps: a loop around it, a line under
 * it, a box, a strike through it. The mark is sized from the wrapped
 * element's real layout on every frame, so it always fits, whatever the
 * font, the text or its length; never guess coordinates for a mark over
 * text or UI, wrap it instead.
 */

export type AnnotateKind = "circle" | "underline" | "box" | "strike";

type Pt = [number, number];

/** The mark's path in its canvas (the element's box plus `pad` on every side). */
function shape(kind: AnnotateKind, w: number, h: number, pad: number, seed: number): Pt[] {
  const pts: Pt[] = [];
  const j = (k: number, amp: number) => (seeded(seed * 31 + k) - 0.5) * amp;
  if (kind === "circle") {
    const cx = pad + w / 2;
    const cy = pad + h / 2;
    const rx = w / 2 + pad * 0.7;
    const ry = h / 2 + pad * 0.7;
    const tilt = j(1, 0.08);
    const start = -Math.PI * 0.62;
    const n = 90;
    for (let i = 0; i <= n; i++) {
      // A loop that runs past where it began, the way a pen circles a word.
      const a = start + (i / n) * Math.PI * 2.12;
      const wob = 1 + Math.sin(i * 0.21 + seed) * 0.025 + (i / n) * 0.05;
      const x = Math.cos(a) * rx * wob;
      const y = Math.sin(a) * ry * wob;
      pts.push([cx + x * Math.cos(tilt) - y * Math.sin(tilt), cy + x * Math.sin(tilt) + y * Math.cos(tilt)]);
    }
  } else if (kind === "underline") {
    const y = pad + h + pad * 0.3;
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      pts.push([pad * 0.6 + u * (w + pad * 0.8), y + Math.sin(u * Math.PI * 1.5 + seed) * pad * 0.12 - u * pad * 0.15]);
    }
  } else if (kind === "strike") {
    const y = pad + h * 0.55;
    for (let i = 0; i <= 30; i++) {
      const u = i / 30;
      pts.push([pad * 0.5 + u * (w + pad), y - u * h * 0.08 + Math.sin(u * 9 + seed) * 1.5]);
    }
  } else {
    const o = pad * 0.55;
    const corners: Pt[] = [
      [pad - o, pad - o + j(2, 6)],
      [pad + w + o + j(3, 6), pad - o],
      [pad + w + o, pad + h + o + j(4, 6)],
      [pad - o + j(5, 6), pad + h + o],
      [pad - o, pad - o - 4],
    ];
    for (let c = 0; c < corners.length - 1; c++) {
      for (let i = 0; i < 20; i++) {
        const u = i / 20;
        pts.push([corners[c][0] + (corners[c + 1][0] - corners[c][0]) * u, corners[c][1] + (corners[c + 1][1] - corners[c][1]) * u]);
      }
    }
    pts.push(corners[corners.length - 1]);
  }
  return pts;
}

export const Annotate = ({
  kind = "circle",
  at,
  dur = 16,
  color = "#E8B04B",
  width = 6,
  pad,
  seed = 3,
  style,
  children,
}: {
  kind?: AnnotateKind;
  /** Frame the pen starts, and how many frames the mark takes. */
  at: number;
  dur?: number;
  color?: string;
  width?: number;
  /** Room between the element and the mark, px (default: a quarter of its height, at least 12). */
  pad?: number;
  seed?: number;
  style?: CSSProperties;
  children: ReactNode;
}) => {
  const t = useCurrentFrame();
  const box = useRef<HTMLSpanElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useLayoutEffect(() => {
    const el = box.current;
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!el || !c || !ctx) return;
    // The element's own layout size: unaffected by any transform around it.
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const p = pad ?? Math.max(12, h * 0.25);
    const cw = Math.ceil(w + p * 2);
    const ch = Math.ceil(h + p * 2);
    if (c.width !== cw) c.width = cw;
    if (c.height !== ch) c.height = ch;
    c.style.left = `${-p}px`;
    c.style.top = `${-p}px`;
    c.style.width = `${cw}px`;
    c.style.height = `${ch}px`;
    ctx.clearRect(0, 0, cw, ch);
    const progress = prog(t, at, at + dur, inOut);
    if (progress <= 0) return;
    const pts = shape(kind, w, h, p, seed);
    const upto = Math.max(1, Math.round(progress * (pts.length - 1)));
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i <= upto; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.stroke();
  });
  return (
    <span ref={box} style={{ position: "relative", display: "inline-block", ...style }}>
      {children}
      <canvas ref={canvas} data-strike={kind === "strike" ? "1" : undefined} style={{ position: "absolute", left: 0, top: 0, pointerEvents: "none" }} />
    </span>
  );
};
