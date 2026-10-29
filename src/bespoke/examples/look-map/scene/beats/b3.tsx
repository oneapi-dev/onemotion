import { useCurrentFrame } from "remotion";
import { Fit, Sfx, outE, prog, useFilm } from "@kit";
import { ACCENT, DISPLAY, MONO, MUTED } from "../theme";

// The last beat holds the name calmly, top left above the map, while the camera settles back on the whole world.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe, brand } = useFilm();
  const inP = prog(t, 10, 30, outE);
  return (
    <div style={{ position: "absolute", left: safe.left, top: Math.max(safe.top, H * 0.06), display: "flex", alignItems: "baseline", gap: 28, opacity: inP, transform: `translateY(${(1 - inP) * 16}px)` }}>
      <Fit text={brand.name} font={DISPLAY} weight={500} size={96} maxW={W * 0.3} style={{ color: ACCENT }} />
      <div style={{ fontFamily: MONO, fontWeight: 500, fontSize: 30, letterSpacing: "0.04em", color: MUTED }}>{brand.url}</div>
      <Sfx name="sub" at={8} volume={0.3} />
    </div>
  );
}
