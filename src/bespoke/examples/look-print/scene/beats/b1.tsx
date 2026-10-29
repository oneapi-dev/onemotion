import { useCurrentFrame } from "remotion";
import { knockout, Misprint, onTwos, riso, RisoPaper, slap, useFilm } from "@kit";
import { ACCENT, DISPLAY, INK, PAPER } from "../theme";

// Risograph: two inks over paper, knocked-out type a little off-register, a sticker slapping on, on twos.
export default function Beat() {
  const t = useCurrentFrame();
  const tt = onTwos(t);
  const { W, H } = useFilm();
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <RisoPaper t={t} paper={PAPER} ink={INK} />
      <div style={{ position: "absolute", left: W * 0.52, top: H * 0.12, width: H * 0.7, height: H * 0.7, borderRadius: "50%", background: INK }} />
      <div style={{ position: "absolute", left: W * 0.4, top: H * 0.5, width: W * 0.34, height: H * 0.3, background: ACCENT }} />
      <div style={{ position: "absolute", left: W * 0.52, top: H * 0.5, width: W * 0.22, height: H * 0.3, background: riso.overlap(ACCENT, INK) }} />
      <Misprint ghost={ACCENT} style={{ position: "absolute", left: W * 0.08, top: H * 0.3 }}>
        {(ink) => <div style={{ fontFamily: DISPLAY, fontSize: 190, lineHeight: 0.9, color: ink ?? INK, ...knockout(190, PAPER) }}>SURF<br />SEASON</div>}
      </Misprint>
      <div style={{ position: "absolute", left: W * 0.66, top: H * 0.16, padding: "22px 36px", borderRadius: 999, background: ACCENT, ...slap(tt, 30) }}>
        <span style={{ fontFamily: DISPLAY, fontSize: 56, color: PAPER }}>IS OPEN</span>
      </div>
    </div>
  );
}
