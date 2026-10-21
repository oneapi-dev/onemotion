import { Grain, World, WorldGrid } from "@kit";
import { BEATS } from "./beats";
import { Pin } from "./components/Pin";
import { ACCENT, BG, DISPLAY, INK, TEXT } from "./theme";

export const fonts = { [DISPLAY]: ["500", "700"], [TEXT]: ["400", "600"] };
export const background = BG;
export const captionStyle = { bg: "rgba(27,27,31,0.88)", fg: "#FFFFFF", hot: ACCENT, font: TEXT };

/**
 * The stage: one paper map the camera travels across. Each beat is a station on it (a zigzag; the
 * camera swoops from one to the next on the beat), and the pin, the film's thread, rides along from
 * station to station. Nothing fades out: the camera leaves a station as it is.
 */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden" }}>
      <World of={BEATS} layout="zigzag" move="swoop" under={<WorldGrid depth={0.45} size={64} color={`${INK}14`} kind="lines" />}>
        <Pin />
      </World>
      <Grain opacity={0.04} />
    </div>
  );
}
