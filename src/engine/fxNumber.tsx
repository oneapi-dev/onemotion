import { Easing, interpolate } from "remotion";
import { useFx } from "./fx";
import { countAt, countable } from "./text";

/**
 * A scene's number as its number effect shows it: counting up (the default)
 * or rolling each digit into place like an odometer. Text around the digits
 * ("$", "+", "M", ".") stays still.
 */

const roll = Easing.bezier(0.2, 0.75, 0.15, 1);

/**
 * Where each digit's strip sits at a frame, in digit heights (0 shows "0",
 * 7 shows "7"): one full turn plus its own digit, the rightmost a turn more,
 * each column starting two frames after the one to its left.
 */
export function odometerPositions(value: string, frame: number, start: number, end: number): number[] {
  const digits = [...value].filter((c) => /\d/.test(c)).map(Number);
  return digits.map((d, col) => {
    const travel = d + 10 * (col === digits.length - 1 ? 2 : 1);
    const p = interpolate(frame, [start + col * 2, Math.max(start + col * 2 + 1, end)], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: roll });
    return Math.round(((p * travel) % 10) * 1000) / 1000;
  });
}

const STRIP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0];
/** Room on each side of a clipped letter for ink that reaches past its advance. */
export const BLEED = 0.12;

function Odometer({ value, f, start, end }: { value: string; f: number; start: number; end: number }) {
  const pos = odometerPositions(value, f, start, end);
  let col = 0;
  return (
    // Normal tracking: each digit stands in its own column, and display type's tight tracking would push neighbours into each other.
    <span style={{ display: "inline-flex", lineHeight: 1, whiteSpace: "pre", letterSpacing: 0 }}>
      {[...value].map((c, i) => {
        if (!/\d/.test(c)) return <span key={i}>{c}</span>;
        const y = pos[col++];
        return (
          // The clip is wider than the digit's advance: display type's negative tracking would otherwise shave its right edge.
          <span key={i} style={{ position: "relative", display: "inline-block", overflow: "hidden", height: "1em", padding: `0 ${BLEED}em`, margin: `0 -${BLEED}em` }}>
            <span style={{ opacity: 0 }}>{c}</span>
            <span style={{ position: "absolute", left: 0, right: 0, top: 0, display: "flex", flexDirection: "column", alignItems: "center", transform: `translateY(${-y}em)` }}>
              {STRIP.map((d, k) => (
                <span key={k} style={{ height: "1em" }}>
                  {d}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

/** A number on a card: counted up, or rolled in when the scene asks for an odometer. */
export function Num({ value, f, start, end }: { value: string; f: number; start: number; end: number }) {
  const fx = useFx();
  if (fx.number === "odometer" && countable(value)) return <Odometer value={value} f={f} start={start} end={end} />;
  return <>{countAt(value, f, start, end)}</>;
}
