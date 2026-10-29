import { useCurrentFrame } from "remotion";
import { Fit, outE, prog, useFilm } from "@kit";
import { ACCENT, HAIR, INK, MONO, MUTED, SERIF, SIZE } from "../theme";

// The last beat holds the name calmly, the survey's source under a hairline rule.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, brand } = useFilm();
  const name = prog(t, 0, 18, outE);
  const rule = prog(t, 16, 36, outE);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, width: W * 0.6 }}>
      <div style={{ opacity: name, transform: `translateY(${(1 - name) * 12}px)` }}>
        <Fit text={brand.name} font={SERIF} weight={600} size={140} maxW={W * 0.5} style={{ color: INK }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: SIZE.kicker + 6, color: ACCENT, letterSpacing: "0.06em", opacity: prog(t, 12, 28, outE) }}>{brand.url}</div>
      <div style={{ width: `${rule * 100}%`, height: 1, background: HAIR, marginTop: 18 }} />
      <div style={{ fontFamily: MONO, fontSize: SIZE.source, color: MUTED, opacity: prog(t, 26, 42, outE) }}>Source: Tidepool rider survey (illustrative figures)</div>
    </div>
  );
}
