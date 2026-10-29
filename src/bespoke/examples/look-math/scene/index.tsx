import { World } from "@kit";
import { BEATS } from "./beats";
import { ACCENT, BOARD, DISPLAY, MATH, TEXT } from "./theme";

export const fonts = { [DISPLAY]: ["400", "600"], [MATH]: ["400"], [TEXT]: ["400", "600"] };
export const background = BOARD;
export const captionStyle = { bg: "rgba(12,14,17,0.86)", fg: "#E8E4DA", hot: ACCENT, font: TEXT };

/**
 * The stage: one dark board. Each beat is a station on it and the camera glides slowly between them,
 * the way a lecturer walks along the board. Nothing glows; things draw themselves and stay.
 */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: BOARD, overflow: "hidden" }}>
      <World of={BEATS} layout="row" move="glide" push={0.025} />
    </div>
  );
}
