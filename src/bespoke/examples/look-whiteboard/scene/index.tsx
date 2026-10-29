import { World } from "@kit";
import { BEATS } from "./beats";
import { ACCENT, BG, HAND, INK, MONO, TEXT } from "./theme";

export const fonts = { [HAND]: ["600"], [TEXT]: ["400", "600"], [MONO]: ["400"] };
export const background = BG;
export const captionStyle = { bg: "rgba(22,22,22,0.88)", fg: "#FFFFFF", hot: ACCENT, font: TEXT };

/**
 * The stage: one long white board. Each beat is a station on it, side by side; the camera glides
 * along the board from one drawing to the next, and every drawing stays where it was made.
 */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, color: INK, overflow: "hidden" }}>
      <World of={BEATS} layout="row" move="glide" />
    </div>
  );
}
