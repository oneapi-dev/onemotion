import { Easing } from "remotion";

/** Every interpolation clamps; every move eases. */
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
export const easeOut = Easing.bezier(0.22, 1, 0.36, 1);
export const easeInOut = Easing.bezier(0.65, 0, 0.35, 1);

/** Room under a masked word for its descenders, in em. */
export const REVEAL_MASK_PAD = 0.12;
/** Degrees a masked word is turned while it waits. */
export const REVEAL_TILT = 4;
/**
 * How far, in px, a masked word waits below its line: past the mask's padded
 * bottom, plus what the tilt lifts its corner by and the ink display type
 * sets above its line box (a fifth of the size), so no glyph tip shows
 * before its turn.
 */
export function revealDrop(size: number, lineHeight: number): number {
  const box = lineHeight * size;
  const rise = box * (1 - Math.cos((REVEAL_TILT * Math.PI) / 180));
  return box + REVEAL_MASK_PAD * size + rise + 0.25 * size;
}
