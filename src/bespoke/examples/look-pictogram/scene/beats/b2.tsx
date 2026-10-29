import { useCurrentFrame } from "remotion";
import { Fit, RingStat, outE, prog, useFilm } from "@kit";
import { ACCENT, INK, MONO, MUTED, SERIF, SIZE, TEXT } from "../theme";

// One number, one ring: the arc draws to 64 % over a second, the figure counting with it, then it holds.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H } = useFilm();
  const head = prog(t, 0, 16, outE);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: W * 0.06 }}>
      <RingStat t={t} at={14} value={0.64} dur={30} size={Math.round(H * 0.42)} color={ACCENT} track="rgba(22,24,26,0.09)" ink={INK} font={TEXT} label="of forecast checkers open Tidepool first" />
      <div style={{ display: "flex", flexDirection: "column", gap: 18, maxWidth: W * 0.36, opacity: head, transform: `translateY(${(1 - head) * 14}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: SIZE.kicker, letterSpacing: "0.14em", color: ACCENT }}>OF THE SEVEN</div>
        <Fit text="Most open Tidepool" font={SERIF} weight={600} size={SIZE.claim} maxW={W * 0.36} style={{ color: INK }} />
        <div style={{ fontFamily: TEXT, fontSize: SIZE.label, color: MUTED, opacity: prog(t, 30, 48, outE) }}>before any other forecast app</div>
      </div>
    </div>
  );
}
