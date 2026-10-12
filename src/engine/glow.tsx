import { Img } from "remotion";

/**
 * A soft radial glow as an image. CSS radial gradients and large blurs do
 * not survive the browser exporter (it draws the DOM to a canvas), but an
 * SVG image does, so every soft light in the engine is one of these.
 */

function rgba(color: string): { rgb: string; a: number } {
  const m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(color.trim());
  if (m) return { rgb: `rgb(${m[1]},${m[2]},${m[3]})`, a: m[4] === undefined ? 1 : Number(m[4]) };
  return { rgb: color, a: 1 };
}

const cache = new Map<string, string>();

/** A data URL of an ellipse fading from `color` at the center to nothing at the edge. */
export function glowSrc(color: string, falloff = 0.62): string {
  const key = `${color}|${falloff}`;
  let src = cache.get(key);
  if (!src) {
    const { rgb, a } = rgba(color);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200"><defs><radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="${rgb}" stop-opacity="${a}"/><stop offset="${falloff * 0.55}" stop-color="${rgb}" stop-opacity="${a * 0.55}"/><stop offset="${falloff}" stop-color="${rgb}" stop-opacity="${a * 0.18}"/><stop offset="1" stop-color="${rgb}" stop-opacity="0"/></radialGradient></defs><rect width="200" height="200" fill="url(#g)"/></svg>`;
    src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
    cache.set(key, src);
  }
  return src;
}

/** A glow placed by its top-left corner and size. */
export const Glow: React.FC<{ color: string; left: number; top: number; width: number; height: number; falloff?: number }> = ({ color, left, top, width, height, falloff }) => (
  <Img src={glowSrc(color, falloff)} style={{ position: "absolute", left, top, width, height }} />
);
