import { Beats, Grain } from "@kit";
import { BEATS } from "./beats";
import { TideMap } from "./components/TideMap";
import { ACCENT, BG, DISPLAY, MONO, TEXT } from "./theme";

export const fonts = { [DISPLAY]: ["500"], [TEXT]: ["600"], [MONO]: ["500"] };
export const background = BG;
export const captionStyle = { bg: "rgba(28,31,35,0.88)", fg: "#FFFFFF", hot: ACCENT, font: TEXT };

/**
 * The stage: one editorial map for the whole film. Its camera flies from the world to Australia and back;
 * the beats are the words, set in the open ocean at the bottom left, over the map (the map is drawn first,
 * so nothing it draws runs over the type).
 */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden" }}>
      <TideMap />
      <Beats of={BEATS} />
      <Grain opacity={0.035} />
    </div>
  );
}
