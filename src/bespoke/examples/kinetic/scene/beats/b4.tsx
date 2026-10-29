import { useCurrentFrame } from "remotion";
import { E, Sfx, prog, useFilm } from "@kit";
import { ACCENT, DISPLAY, INK, MONO } from "../theme";

// The logo card, the only rest: a line, the name on the hit, the address after, a slow push.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, brand } = useFilm();
  const line = prog(t, 0, 8, E.out);
  const name = prog(t, 4, 14, E.out);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, background: ACCENT, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", transform: `scale(${1 + 0.0008 * t})` }}>
      <div style={{ width: 420 * line, height: 6, background: INK, marginBottom: 40 }} />
      <div style={{ fontFamily: DISPLAY, fontSize: 200, color: INK, lineHeight: 0.92, clipPath: `inset(0 ${(1 - name) * 100}% 0 0)` }}>{brand.name.toUpperCase()}</div>
      <div style={{ fontFamily: MONO, fontSize: 34, color: `${INK}B3`, marginTop: 36, opacity: prog(t, 16, 26) }}>{brand.url}</div>
      <Sfx name="sub" at={3} volume={0.5} />
    </div>
  );
}
