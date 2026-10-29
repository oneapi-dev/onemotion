import { useCurrentFrame } from "remotion";
import { Pen, Sfx, path, penTimes, useFilm, type PenStroke } from "@kit";
import { ACCENT, HAND, INK, SIZE } from "../theme";

/**
 * b1 opens the film, so its first frame is the thumbnail: the pen is already writing the title.
 * One element at a time: the title, the axis, the wave and its label, then the peak circled in blue.
 * The board's coordinates are fractions of its size, so it reflows with the format.
 */
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  const bw = Math.min(W * 0.8, safe.right - safe.left);
  const bh = Math.min(H * 0.72, safe.bottom - safe.top);
  const base = bh * 0.78;
  // A wave of three crests, the middle one tallest: the peak.
  const crest = (u: number) => bh * (0.12 + 0.36 * Math.exp(-(((u - 0.5) / 0.16) ** 2)));
  const wave: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const u = i / 120;
    wave.push([bw * (0.08 + 0.82 * u), base - crest(u) * (0.5 - 0.5 * Math.cos(Math.PI * 6 * u))]);
  }
  const peak = { x: bw * 0.49, y: base - crest(0.5) };
  const strokes: PenStroke[] = [
    { label: { text: "Traffic comes in waves", x: bw * 0.04, y: bh * 0.08, size: SIZE.title }, hold: 10 },
    { d: path.line(bw * 0.06, base, bw * 0.94, base), dur: 16, width: 4, hold: 4 },
    { d: path.polyline(wave), dur: 44, label: { text: "requests", x: bw * 0.86, y: base + SIZE.label * 0.9, align: "center" } },
    { d: path.ellipse(peak.x, peak.y, bw * 0.06, bh * 0.07), color: ACCENT, width: 5, label: { text: "the peak", x: peak.x + bw * 0.08, y: peak.y - bh * 0.04, color: ACCENT } },
  ];
  const opts = { at: -16, hold: 18 };
  const { times } = penTimes(strokes, opts);
  return (
    <>
      <Pen t={t} {...opts} strokes={strokes} w={bw} h={bh} color={INK} font={HAND} labelSize={SIZE.label} />
      {/* The marker squeaks as each line starts: the helper says when. */}
      {times.map((tm, i) => (strokes[i].d ? <Sfx key={i} name="marker" at={tm.start} volume={0.18} /> : null))}
    </>
  );
}
