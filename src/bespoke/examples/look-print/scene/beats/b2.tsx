import { useCurrentFrame } from "remotion";
import { Halftone, onTwos, outE, prog, TornStrip, useFilm } from "@kit";
import { CONDENSED, NAVY, RED, TEXT } from "../theme";

// Paper documentary: cream paper, halftone, a caption on a torn strip, a photo card dropping, on twos.
export default function Beat() {
  const t = useCurrentFrame();
  const tt = onTwos(t);
  const { W, H } = useFilm();
  const drop = prog(tt, 20, 32, outE);
  return (
    <div style={{ position: "absolute", inset: 0, background: "#F1E6D0", overflow: "hidden" }}>
      <Halftone color={NAVY} opacity={0.14} />
      <div style={{ position: "absolute", left: W * 0.55, top: H * 0.14 - (1 - drop) * H, width: W * 0.34, height: H * 0.5, background: "#FBF7EE", boxShadow: "8px 10px 0 rgba(20,20,20,0.15)", transform: `rotate(${3 - (1 - drop) * 10}deg)`, padding: 28 }}>
        <div style={{ width: "100%", height: "78%", background: NAVY }} />
        <div style={{ fontFamily: TEXT, fontWeight: 700, fontSize: 30, color: NAVY, marginTop: 16 }}>1958 · the first forecast</div>
      </div>
      <TornStrip w={W * 0.46} h={170} seed={4} style={{ position: "absolute", left: W * 0.06, top: H * 0.42, transform: `translateX(${(1 - prog(tt, 2, 12, outE)) * -W * 0.6}px)` }}>
        <span style={{ fontFamily: CONDENSED, fontSize: 104, color: NAVY, textShadow: `-3px 0 ${RED}88, 3px 0 rgba(40,140,200,0.45)` }}>WHY WAVES BREAK</span>
      </TornStrip>
    </div>
  );
}
