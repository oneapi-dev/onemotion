import { useCurrentFrame } from "remotion";
import { Fit, Mark, Sfx, outE, prog, useFilm } from "@kit";
import { ACCENT, DISPLAY, MUTED, TEXT } from "../theme";

// The last beat holds the brand calmly to the end, with a small loop of life (the camera's slow push does the rest).
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, brand } = useFilm();
  const inP = prog(t, 0, 18, outE);
  const breathe = 1 + Math.sin(t / 20) * 0.01;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: H * 0.03, opacity: inP }}>
      <div style={{ transform: `scale(${(0.9 + 0.1 * inP) * breathe})` }}>
        <Mark size={Math.round(H * 0.16)} />
      </div>
      <Fit text={brand.name} font={DISPLAY} weight={700} size={120} maxW={W * 0.6} style={{ color: ACCENT }} />
      <div style={{ fontFamily: TEXT, fontSize: 34, color: MUTED }}>{brand.url}</div>
      <Sfx name="sub" at={0} volume={0.35} />
    </div>
  );
}
