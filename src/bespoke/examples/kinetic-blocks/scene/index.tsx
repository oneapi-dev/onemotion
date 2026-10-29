import { Grain, World } from "@kit";
import { BEATS } from "./beats";
import { DARK, DISPLAY, MONO } from "./theme";

export const fonts = { [DISPLAY]: ["400"], [MONO]: ["500"] };
export const background = DARK;
export const captions = false;

/** Every scene block of the kinetic kit, one station each, hard cuts on the beat. */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: DARK, overflow: "hidden" }}>
      <World of={BEATS} move="cut" push={0} />
      <Grain opacity={0.05} dark />
    </div>
  );
}
