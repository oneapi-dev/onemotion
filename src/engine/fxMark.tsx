import { Easing, Img, interpolate, useCurrentFrame } from "remotion";
import { useFx } from "./fx";
import { useLook } from "./looks";

/**
 * A hand-drawn stroke on a headline's accent word: an underline or a loop
 * around it, drawn on after the word has entered. It sits over the word's
 * box (place it inside a positioned wrapper) and never changes its layout.
 *
 * Drawn as an image of an SVG rather than inline SVG: the browser exporter
 * rasterizes every inline SVG again on every frame, while an image whose
 * source stops changing once the stroke is complete is decoded once. The
 * SVG's view box has the box's own proportions (estimated from the word's
 * length), so the stroke is never stretched and its dash, which draws it
 * on, covers the whole line.
 */

const draw = Easing.bezier(0.45, 0, 0.25, 1);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Each shape: its box around the word (fractions of the word's width and line height) and its path in a 100 x 100 square. */
const SHAPES = {
  // A quick marker swipe, rising a little to the right.
  underline: { x: -0.04, y: 0.84, w: 1.08, h: 0.34, d: "M2 62 C 22 48, 44 70, 66 52 S 90 34, 98 40" },
  // A loop that does not quite close, the way a pen circles a word.
  circle: { x: -0.12, y: -0.22, w: 1.24, h: 1.42, d: "M58 8 C 84 6, 99 28, 97 50 C 95 78, 68 95, 44 93 C 17 91, 2 72, 4 48 C 6 23, 28 7, 63 11" },
} as const;

/** The path with every x stretched by k: a 100 x 100 drawing widened to a k:1 view box. */
const widen = (d: string, k: number) => {
  let i = 0;
  return d.replace(/-?\d+(?:\.\d+)?/g, (n) => String(i++ % 2 === 0 ? Math.round(Number(n) * k * 100) / 100 : n));
};

/** Drawing progress is stepped so a stroke being drawn changes its image at most once a frame and a finished one never. */
const STEPS = 24;

export const AccentMark: React.FC<{ at: number; size: number; chars: number }> = ({ at, size, chars }) => {
  const fx = useFx();
  const look = useLook();
  const frame = useCurrentFrame();
  if (!fx.mark) return null;
  const shape = SHAPES[fx.mark];
  const p = Math.round(draw(interpolate(frame - at, [0, 16], [0, 1], clamp)) * STEPS) / STEPS;
  if (p <= 0) return null;
  // The word's box, roughly: display type averages a little over half an em per letter.
  const wordW = Math.max(1, chars) * size * 0.56;
  const lineH = size * 1.02;
  const boxW = wordW * shape.w;
  const boxH = lineH * shape.h;
  const k = boxW / boxH;
  const stroke = (Math.max(3, size * 0.07) / boxH) * 100;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-stroke} ${-stroke} ${100 * k + stroke * 2} ${100 + stroke * 2}" preserveAspectRatio="none"><path d="${widen(shape.d, k)}" fill="none" stroke="${look.accentA}" stroke-width="${stroke}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="${1 - p}"/></svg>`;
  const padX = (stroke / (100 * k)) * boxW;
  const padY = (stroke / 100) * boxH;
  return (
    <Img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      style={{
        position: "absolute",
        left: `calc(${shape.x * 100}% - ${padX}px)`,
        top: `calc(${shape.y * 100}% - ${padY}px)`,
        width: `calc(${shape.w * 100}% + ${padX * 2}px)`,
        height: boxH + padY * 2,
        pointerEvents: "none",
      }}
    />
  );
};
