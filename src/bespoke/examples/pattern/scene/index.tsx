import { useCurrentFrame } from "remotion";
import { Beats, Ink, path, useFilm } from "@kit";
import { BEATS } from "./beats";
import { ACCENT, BG, DISPLAY, TEXT } from "./theme";

export const fonts = { [DISPLAY]: ["500", "700"], [TEXT]: ["400", "600"] };
export const background = BG;
export const captionStyle = { bg: "rgba(27,27,31,0.88)", fg: "#FFFFFF", hot: ACCENT, font: TEXT };

/** The persistent stage: a folded paper map that stays for the whole film, with the beats on top of it. */
export default function Scene() {
  const t = useCurrentFrame();
  const { W, H } = useFilm();
  // A slow drift keeps the hold alive; one fold line draws itself on at the start.
  const drift = Math.sin(t / 90) * 6;
  return (
    <div style={{ position: "absolute", inset: 0, background: BG }}>
      <div style={{ position: "absolute", inset: 0, transform: `translateX(${drift}px)` }}>
        <Ink strokes={[{ d: path.curve(W * 0.08, H * 0.86, W * 0.92, H * 0.18, 0.25), at: 2, dur: 40, color: "rgba(27,27,31,0.12)", width: 3, dash: [14, 12] }]} />
      </div>
      <Beats of={BEATS} overlap={10} />
    </div>
  );
}
