import { useCurrentFrame } from "remotion";
import { Fit, outE, prog, useFilm } from "@kit";
import { ACCENT, HAIR, INK, MONO, MUTED, SERIF, SIZE } from "../theme";

// The last beat is the masthead: a hairline rule draws across, the name and the address sit under it, and it holds.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, brand } = useFilm();
  const rule = prog(t, 0, 20, outE);
  const name = prog(t, 8, 26, outE);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 22, width: W * 0.6 }}>
      <div style={{ width: `${rule * 100}%`, height: 1, background: HAIR }} />
      <div style={{ opacity: name, transform: `translateY(${(1 - name) * 12}px)` }}>
        <Fit text={brand.name} font={SERIF} weight={600} size={140} maxW={W * 0.5} style={{ color: INK }} />
      </div>
      <div style={{ fontFamily: MONO, fontSize: SIZE.kicker + 6, color: ACCENT, letterSpacing: "0.06em", opacity: prog(t, 20, 36, outE) }}>{brand.url}</div>
      <div style={{ fontFamily: MONO, fontSize: SIZE.source, color: MUTED, opacity: prog(t, 28, 44, outE) }}>Know before you paddle out</div>
    </div>
  );
}
