import { World, WorldGrid } from "@kit";
import { BEATS } from "./beats";
import { ACCENT, BG, INK, MONO, SERIF, TEXT } from "./theme";

export const fonts = { [SERIF]: ["500", "600"], [TEXT]: ["400", "500", "600", "700"], [MONO]: ["400", "500"] };
export const background = BG;
export const captionStyle = { bg: "rgba(26,26,26,0.88)", fg: "#FFFFFF", hot: ACCENT, font: TEXT };

/**
 * The stage: one long newspaper page the camera reads down. Each beat is a graphic on it (a column;
 * the camera glides from one to the next), set on faint hairline rules. The chart is the star of
 * every station: a claim as its title, grey for the rest, the accent for the one series that matters.
 */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden" }}>
      <World of={BEATS} layout="column" move="glide" under={<WorldGrid depth={0.4} size={120} color={`${INK}0A`} kind="lines" weight={1} />} />
    </div>
  );
}
