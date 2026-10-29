import { useCurrentFrame } from "remotion";
import { Pen, Sfx, path, useFilm, type PenStroke } from "@kit";
import { ACCENT, HAND, INK, MUTED, SIZE } from "../theme";

// The close: the marker writes the name, underlines it in blue and adds the address, then lifts
// away and the board holds still to the end.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, brand, safe } = useFilm();
  const bw = Math.min(W * 0.7, safe.right - safe.left);
  const bh = Math.min(H * 0.6, safe.bottom - safe.top);
  const cx = bw / 2;
  const strokes: PenStroke[] = [
    { label: { text: brand.name, x: cx, y: bh * 0.4, size: SIZE.name, align: "center", dur: 24 }, hold: 0 },
    { d: path.curve(cx - bw * 0.2, bh * 0.6, cx + bw * 0.2, bh * 0.6, -10), color: ACCENT, width: 7, dur: 16, hold: 6 },
    { label: { text: brand.url, x: cx, y: bh * 0.76, size: SIZE.url, align: "center", color: MUTED } },
  ];
  return (
    <>
      <Pen t={t} at={4} strokes={strokes} w={bw} h={bh} color={INK} font={HAND} labelSize={SIZE.label} />
      <Sfx name="marker" at={4} volume={0.18} />
    </>
  );
}
