import { useCurrentFrame } from "remotion";
import { Fit, Pictogram, outE, prog, useFilm } from "@kit";
import { ACCENT, DIM, INK, MONO, MUTED, SERIF, SIZE, TEXT } from "../theme";

// b1 opens the film, so its first frame is the thumbnail: the claim is up and the grid is fading in.
// Seven of ten surfers light in the accent, three apart; the key under the row says what lit means.
export default function Beat() {
  const t = useCurrentFrame();
  const { W } = useFilm();
  const head = prog(t, -15, 10, outE);
  const key = prog(t, 60, 76, outE);
  const icon = Math.round(W * 0.06);
  const swatch = (color: string, alpha: number) => <span style={{ display: "inline-block", width: 18, height: 18, borderRadius: 9, background: color, opacity: alpha, marginRight: 10, verticalAlign: "-2px" }} />;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
      <div style={{ fontFamily: MONO, fontSize: SIZE.kicker, letterSpacing: "0.14em", color: ACCENT, opacity: head }}>TIDEPOOL SURVEY</div>
      <div style={{ marginTop: 14, opacity: head, transform: `translateY(${(1 - head) * 14}px)` }}>
        <Fit text="7 of 10 surfers check the forecast first" font={SERIF} weight={600} size={SIZE.claim} maxW={W * 0.78} style={{ color: INK }} />
      </div>
      <Pictogram t={t} at={4} total={10} value={7} icon="person" size={icon} gap={icon * 0.3} color={ACCENT} base={DIM} dim={0.3} step={4} style={{ marginTop: 72 }} />
      <div style={{ display: "flex", gap: 48, marginTop: 48, fontFamily: TEXT, fontSize: SIZE.label, color: MUTED, opacity: key }}>
        <span>{swatch(ACCENT, 1)}Checks the forecast first</span>
        <span>{swatch(DIM, 0.3)}Goes by eye</span>
      </div>
    </div>
  );
}
