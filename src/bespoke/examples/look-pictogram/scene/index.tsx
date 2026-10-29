import { World } from "@kit";
import { BEATS } from "./beats";
import { ACCENT, BG, MONO, SERIF, TEXT } from "./theme";

export const fonts = { [SERIF]: ["500", "600"], [TEXT]: ["400", "500", "600", "700"], [MONO]: ["400", "500"] };
export const background = BG;
export const captionStyle = { bg: "rgba(22,24,26,0.88)", fg: "#FFFFFF", hot: ACCENT, font: TEXT };

/**
 * The stage: a plain off-white sheet, a row of stations the camera glides along. Each beat tells one
 * number with icons or a ring: the units that count lit in the accent, the rest at a quarter strength,
 * so the share is seen before it is read. No decoration competes with the count.
 */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden" }}>
      <World of={BEATS} layout="row" move="glide" />
    </div>
  );
}
