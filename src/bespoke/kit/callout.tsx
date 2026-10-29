// A callout for one inflection in a chart. Its own module: LineChart in
// blocks.tsx draws it, and data.tsx (which imports blocks) re-exports it.
import { Easing } from "remotion";
import { mix, prog } from "./motion";

const outQuad = Easing.out(Easing.quad);
const outCubic = Easing.out(Easing.cubic);

/** @internal A callout's presence: rises over the 10 frames before `event`, holds `hold` frames (1.5 s at 30 fps), leaves over 10. */
export const calloutAlpha = (t: number, event: number, hold = 45) => (t < event ? prog(t, event - 10, event, outQuad) : 1 - prog(t, event + hold, event + hold + 10, outQuad));

/**
 * One inflection in a chart, marked: a ring round the point (x, y), a
 * leader drawn from `start` px off the point to (x + dx, y + dy), and the
 * short text at its end (`align` "start" runs it right, "end" left). It is
 * there from 10 frames before `event` to `hold` frames (1.5 s) plus 10
 * after. An SVG group: put it inside the chart's <svg> (or an absolute
 * <svg style={{ overflow: "visible" }}> over HTML). One per chart.
 */
export const Callout = ({ t, event, x, y, dx = 0, dy = -90, start = 18, text, color, ink, font, size = 24, hold = 45, align = "start" }: { t: number; event: number; x: number; y: number; dx?: number; dy?: number; start?: number; text: string; color: string; ink: string; font: string; size?: number; hold?: number; align?: "start" | "end" }) => {
  const a = calloutAlpha(t, event, hold);
  if (a <= 0) return null;
  const draw = prog(t, event - 10, event + 2, outCubic);
  const len = Math.hypot(dx, dy) || 1;
  const sx = x + (dx / len) * start;
  const sy = y + (dy / len) * start;
  const ex = mix(sx, x + dx, draw);
  const ey = mix(sy, y + dy, draw);
  const side = align === "end" ? -1 : 1;
  return (
    <g opacity={a} style={{ fontFamily: font }}>
      <circle cx={x} cy={y} r={14} fill="none" stroke={color} strokeWidth={2} opacity={prog(t, event - 10, event - 4, outQuad)} />
      <line x1={sx} y1={sy} x2={ex} y2={ey} stroke={ink} strokeOpacity={0.7} strokeWidth={1.5} />
      <text x={x + dx + side * 10} y={y + dy} dy="0.35em" textAnchor={align} fill={ink} fontSize={size} fontWeight={600} opacity={prog(t, event - 4, event + 4, outQuad)}>
        {text}
      </text>
    </g>
  );
};
