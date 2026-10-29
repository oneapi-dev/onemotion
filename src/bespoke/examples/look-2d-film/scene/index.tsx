import { World } from "@kit";
import { BEATS } from "./beats";

export const fonts = { Fredoka: ["600", "700"], Nunito: ["800", "900"], "Playfair Display": ["900i"] };
export const background = "#000000";
export const captions = false;

/** The aiTrends reference film, its shots played by Studio2D: one full-frame station a beat, hard cuts between. */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}>
      <World of={BEATS} move="cut" push={0} open={0} />
    </div>
  );
}
