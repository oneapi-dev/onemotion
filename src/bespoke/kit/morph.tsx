import type { CSSProperties, ReactNode } from "react";
import { useFilm } from "./film";
import { inOut, mix, outE, prog } from "./motion";

/**
 * Keynote-style morphs: one object changing shape, never a fade between two
 * slides (charlie947's motion-effects: the shell grows, its contents never
 * scale, old contents leave in the first quarter, new ones arrive past half).
 */

export type Rect = { x: number; y: number; w: number; h: number; r?: number };

/** @internal The shell's rectangle at progress p (0 to 1), corners included. */
export const rectAt = (a: Rect, b: Rect, p: number): Required<Rect> => ({ x: mix(a.x, b.x, p), y: mix(a.y, b.y, p), w: mix(a.w, b.w, p), h: mix(a.h, b.h, p), r: mix(a.r ?? 0, b.r ?? 0, p) });

/**
 * One surface that grows from `from` to `to` (frame rectangles, px) between `at` and `at + dur`, clipped with
 * rounded corners so nothing inside scales. `old` sits in the start rectangle and leaves in the first 25 % of
 * the move; `next` (or children) sits in the end rectangle and arrives after 50 %. A faint ghost of the start
 * outline stays at its origin for 12 frames.
 */
export const Shell = ({ t, at, dur = 21, from, to, fill = "#FFFFFF", line, old, next, children, ghost = true, style }: { t: number; at: number; dur?: number; from: Rect; to: Rect; fill?: string; line?: string; old?: ReactNode; next?: ReactNode; children?: ReactNode; ghost?: boolean; style?: CSSProperties }) => {
  const { W, H } = useFilm();
  const p = prog(t, at, at + dur, inOut);
  const r = rectAt(from, to, p);
  const clip = `inset(${r.y.toFixed(1)}px ${(W - r.x - r.w).toFixed(1)}px ${(H - r.y - r.h).toFixed(1)}px ${r.x.toFixed(1)}px round ${r.r.toFixed(1)}px)`;
  const oldOut = 1 - prog(t, at, at + dur * 0.25);
  const nextIn = prog(t, at + dur * 0.5, at + dur, outE);
  const fade = t >= at ? 1 - prog(t, at, at + 12) : 0;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none", ...style }}>
      {ghost && fade > 0 ? <div aria-hidden data-qa="echo" style={{ position: "absolute", left: from.x, top: from.y, width: from.w, height: from.h, borderRadius: from.r ?? 0, border: `2px solid ${line ?? fill}`, opacity: 0.35 * fade }} /> : null}
      <div style={{ position: "absolute", inset: 0, background: fill, clipPath: clip, boxShadow: line ? `inset 0 0 0 1px ${line}` : undefined }}>
        {old && oldOut > 0 ? <div style={{ position: "absolute", left: from.x, top: from.y, width: from.w, height: from.h, opacity: oldOut }}>{old}</div> : null}
        {next ?? children ? (
          <div style={{ position: "absolute", left: to.x, top: to.y, width: to.w, height: to.h, opacity: nextIn, transform: `translateY(${((1 - nextIn) * 14).toFixed(1)}px)` }}>{next ?? children}</div>
        ) : null}
      </div>
    </div>
  );
};

/** @internal A turn in depth drawn in 2D: the width (or height) foreshortened by the cosine, the far edge sheared a little. */
export const tiltTransform = (rx: number, ry: number) => {
  const rad = Math.PI / 180;
  return `scale(${Math.cos(ry * rad).toFixed(4)}, ${Math.cos(rx * rad).toFixed(4)}) skewY(${(-ry * 0.22).toFixed(2)}deg) skewX(${(rx * 0.22).toFixed(2)}deg)`;
};

/**
 * One element turned in depth: it starts at `rx`/`ry` degrees and settles to `toRx`/`toRy` (flat by default)
 * between `at` and `at + dur`. Drawn in 2D (foreshortening plus a slight shear), because CSS perspective
 * vanishes in the export once a station sits away from the world's origin. Keep turns under about 20 degrees.
 */
export const Tilt = ({ t, at, dur = 24, rx = 0, ry = -14, toRx = 0, toRy = 0, origin = "50% 50%", children, style }: { t: number; at: number; dur?: number; rx?: number; ry?: number; toRx?: number; toRy?: number; origin?: string; children: ReactNode; style?: CSSProperties }) => {
  const p = prog(t, at, at + dur, outE);
  return <div style={{ transform: tiltTransform(mix(rx, toRx, p), mix(ry, toRy, p)), transformOrigin: origin, ...style }}>{children}</div>;
};
