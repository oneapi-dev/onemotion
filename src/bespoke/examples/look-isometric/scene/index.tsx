import { Grain, World } from "@kit";
import { BEATS } from "./beats";
import { ACCENT, BG, DISPLAY, TEXT } from "./theme";

export const fonts = { [DISPLAY]: ["500", "700"], [TEXT]: ["400", "600"] };
export const background = BG;
export const captionStyle = { bg: "rgba(35,38,43,0.88)", fg: "#FFFFFF", hot: ACCENT, font: TEXT };

/**
 * The stage: one small model of the Tidepool system, seen from above. Each beat is a station showing the
 * model at one step (it grows as the story goes); the camera glides between them. The model never rotates:
 * it drifts by translation only.
 */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden" }}>
      <World of={BEATS} layout="row" move="glide" push={0.02} />
      <Grain opacity={0.03} />
    </div>
  );
}
