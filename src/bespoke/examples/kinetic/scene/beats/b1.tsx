import { useCurrentFrame } from "remotion";
import { Charge, KineticType, onBeat, useFilm, type KShot } from "@kit";
import { ACCENT, DARK, DISPLAY, INK, PAPER } from "../theme";

// A charge into the first word, then one idea a beat; the ground flips on the phrase change and the cuts accelerate.
export default function Beat() {
  const t = useCurrentFrame();
  const { pulse } = useFilm();
  const b = (k: number) => onBeat(0, k, pulse);
  const shots: KShot[] = [
    { at: b(1), text: "THE SWELL", style: "slam", fx: "hit" },
    { at: b(2), text: ["IS", "COMING."], style: "stack", ground: ACCENT, in: "right" },
    { at: b(4), text: ["BE THERE", "FIRST."], style: "split", ground: PAPER, accent: ACCENT, in: "up", fx: "hit" },
    { at: b(6), text: "FIRST.", style: "cut", ground: ACCENT, color: INK, rot: -3 },
    { at: b(6.5), text: "FIRST.", style: "cut", ground: DARK, color: ACCENT, rot: 2 },
    { at: b(7), text: "FIRST.", style: "cut", ground: PAPER, color: INK, fx: "hit" },
  ];
  return (
    <>
      <Charge t={t} at={b(1)} dur={b(1)} color={ACCENT} />
      <KineticType t={t} shots={shots} font={DISPLAY} weight={400} paper={PAPER} ink={INK} ground={DARK} />
    </>
  );
}
