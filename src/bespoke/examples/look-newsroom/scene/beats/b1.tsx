import { useCurrentFrame } from "remotion";
import { Fit, LineChart, outE, prog, useFilm } from "@kit";
import { ACCENT, CHART, HAIR, INK, MONO, MUTED, SERIF, SIZE, TEXT } from "../theme";

const RIDERS = [
  { label: "Jan", value: 12 },
  { label: "Mar", value: 15 },
  { label: "May", value: 19 },
  { label: "Jul", value: 31 },
  { label: "Sep", value: 38 },
  { label: "Nov", value: 41 },
];

// b1 opens the film, so its first frame is the thumbnail: the claim is already up, the axes start drawing.
// The title is a claim, not a topic. The chart is the star; its one callout marks the inflection.
export default function Beat() {
  const t = useCurrentFrame();
  const { safe } = useFilm();
  const head = prog(t, -15, 10, outE);
  const sub = prog(t, 0, 18, outE);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: CHART.w }}>
      <div style={{ fontFamily: MONO, fontSize: SIZE.kicker, letterSpacing: "0.14em", color: ACCENT, opacity: head }}>TIDEPOOL · RIDERS</div>
      <div style={{ marginTop: 12, opacity: head, transform: `translateY(${(1 - head) * 14}px)` }}>
        <Fit text="Riders tripled after swell alerts" font={SERIF} weight={600} size={SIZE.claim} maxW={Math.min(CHART.w, safe.right - safe.left)} style={{ color: INK }} />
      </div>
      <div style={{ fontFamily: TEXT, fontSize: SIZE.sub, color: MUTED, marginTop: 8, opacity: sub }}>Monthly active surfers, thousands</div>
      <div style={{ marginTop: 56, marginLeft: 20 }}>
        <LineChart t={t} at={6} data={RIDERS} w={CHART.w - 40} h={CHART.h} color={ACCENT} ink={INK} font={TEXT} dur={96} decimals={0} unit="k" min={0} axis area callout={{ index: 3, text: "Swell alerts launch" }} />
      </div>
      <div style={{ width: "100%", borderTop: `1px solid ${HAIR}`, marginTop: 18, paddingTop: 10, fontFamily: MONO, fontSize: SIZE.source, color: MUTED, opacity: prog(t, 120, 140, outE) }}>Source: Tidepool rider logs (illustrative figures)</div>
    </div>
  );
}
