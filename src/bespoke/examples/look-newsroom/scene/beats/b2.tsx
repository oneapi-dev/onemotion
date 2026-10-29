import { useCurrentFrame } from "remotion";
import { Fit, RankRace, outE, prog, useBeat, useFilm, type RaceRow } from "@kit";
import { ACCENT, CHART, GREY, HAIR, INK, MONO, MUTED, SERIF, SIZE, TEXT } from "../theme";

/** Surf days so far this year, per break, month by month. Medewi starts fourth and finishes first. */
const ROWS: RaceRow[] = [
  { label: "Jan", values: { Uluwatu: 22, Canggu: 25, Keramas: 18, Medewi: 14, Balangan: 16, "Padang Padang": 12, "Nusa Dua": 9, Sanur: 6 } },
  { label: "Feb", values: { Uluwatu: 41, Canggu: 47, Keramas: 35, Medewi: 33, Balangan: 30, "Padang Padang": 25, "Nusa Dua": 19, Sanur: 11 } },
  { label: "Mar", values: { Uluwatu: 62, Canggu: 66, Keramas: 51, Medewi: 56, Balangan: 44, "Padang Padang": 39, "Nusa Dua": 30, Sanur: 15 } },
  { label: "Apr", values: { Uluwatu: 85, Canggu: 84, Keramas: 66, Medewi: 81, Balangan: 60, "Padang Padang": 55, "Nusa Dua": 42, Sanur: 19 } },
  { label: "May", values: { Uluwatu: 108, Canggu: 101, Keramas: 80, Medewi: 109, Balangan: 75, "Padang Padang": 72, "Nusa Dua": 55, Sanur: 22 } },
  { label: "Jun", values: { Uluwatu: 129, Canggu: 118, Keramas: 93, Medewi: 138, Balangan: 91, "Padang Padang": 90, "Nusa Dua": 66, Sanur: 25 } },
];

// The race fills the beat: it starts once the claim has landed, and its final hold runs to the beat's end.
export default function Beat() {
  const t = useCurrentFrame();
  const { safe } = useFilm();
  const { len } = useBeat();
  const head = prog(t, 0, 16, outE);
  const at = 14;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", width: CHART.w }}>
      <div style={{ fontFamily: MONO, fontSize: SIZE.kicker, letterSpacing: "0.14em", color: ACCENT, opacity: head }}>TIDEPOOL · BREAKS</div>
      <div style={{ marginTop: 12, opacity: head, transform: `translateY(${(1 - head) * 14}px)` }}>
        <Fit text="Medewi logged the most surf days" font={SERIF} weight={600} size={SIZE.claim} maxW={Math.min(CHART.w, safe.right - safe.left)} style={{ color: INK }} />
      </div>
      <div style={{ fontFamily: TEXT, fontSize: SIZE.sub, color: MUTED, marginTop: 8, opacity: prog(t, 6, 22, outE) }}>Surf days so far this year, top six Bali breaks</div>
      <div style={{ marginTop: 40 }}>
        <RankRace t={t} at={at} rows={ROWS} w={CHART.w} h={CHART.h} dur={len - at - 4} hold={70} top={6} highlight="Medewi" color={ACCENT} grey={GREY} ink={INK} font={TEXT} />
      </div>
      <div style={{ width: "100%", borderTop: `1px solid ${HAIR}`, marginTop: 18, paddingTop: 10, fontFamily: MONO, fontSize: SIZE.source, color: MUTED, opacity: prog(t, 30, 50, outE) }}>Source: Tidepool forecast archive (illustrative figures)</div>
    </div>
  );
}
