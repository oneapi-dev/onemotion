import { World } from "@kit";
import { BEATS } from "./beats";
import { CONDENSED, DISPLAY, PAPER, TEXT } from "./theme";

export const fonts = { [DISPLAY]: ["400"], [CONDENSED]: ["400"], [TEXT]: ["500", "700"] };
export const background = PAPER;
export const captions = false;

/** Full-frame stations, hard cuts: each beat tests one printed look. */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: PAPER, overflow: "hidden" }}>
      <World of={BEATS} move="cut" push={0} />
    </div>
  );
}
