import { useCurrentFrame } from "remotion";
import { Denial, onBeat, useFilm } from "@kit";
import { ACCENT, DARK, DISPLAY, MONO, PAPER } from "../theme";

const Chart = ({ W, H }: { W: number; H: number }) => (
  <div style={{ position: "absolute", left: W * 0.18, top: H * 0.2, width: W * 0.64, height: H * 0.6, border: `3px solid ${PAPER}55`, borderRadius: 18, display: "flex", alignItems: "flex-end", gap: 14, padding: 40, boxSizing: "border-box" }}>
    {[0.3, 0.55, 0.4, 0.8, 0.35, 0.6, 0.45, 0.7].map((h, i) => (
      <div key={i} style={{ flex: 1, height: `${h * 100}%`, background: `${PAPER}33`, borderRadius: 6 }} />
    ))}
    <div style={{ position: "absolute", left: 40, top: 28, fontFamily: MONO, fontSize: 26, color: `${PAPER}99` }}>swell_forecast_v3.csv</div>
  </div>
);

const Cam = ({ W, H }: { W: number; H: number }) => (
  <div style={{ position: "absolute", left: W * 0.2, top: H * 0.18, width: W * 0.6, height: H * 0.64, background: "#D9D4C7", borderRadius: 18, overflow: "hidden" }}>
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "38%", background: "#B9B09A" }} />
    <div style={{ position: "absolute", left: 32, top: 26, fontFamily: MONO, fontSize: 26, color: DARK }}>BEACH CAM 02 · LIVE</div>
  </div>
);

// Two denials, four beats apart: each mock shows, NO slams, the word fills, the mock is cut apart.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, pulse } = useFilm();
  const second = onBeat(0, 4, pulse);
  return (
    <>
      <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, background: t < second ? DARK : PAPER }} />
      {t < second ? (
        <Denial t={t} at={0} word="GUESSING." mock={<Chart W={W} H={H} />} font={DISPLAY} weight={400} color={PAPER} accent={ACCENT} />
      ) : (
        <Denial t={t} at={second} word="EMPTY BEACHES." mock={<Cam W={W} H={H} />} font={DISPLAY} weight={400} color={DARK} accent={ACCENT} />
      )}
    </>
  );
}
