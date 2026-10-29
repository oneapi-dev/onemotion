import { useCurrentFrame } from "remotion";
import { Morph, prog, useBeat, useFilm } from "@kit";
import { Headline } from "../components/Headline";
import { ACCENT, INK } from "../theme";

/** A closed circle as path data (64 sides, closed with Z so the morph knows it is a loop). */
const circle = (cx: number, cy: number, r: number) =>
  Array.from({ length: 64 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 64) * Math.PI * 2;
    return `${i ? "L" : "M"}${(cx + Math.cos(a) * r).toFixed(1)} ${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ") + " Z";

/** One period of the wave, left to right, as an open line. */
const wave = (x0: number, x1: number, cy: number, amp: number) =>
  Array.from({ length: 97 }, (_, i) => {
    const u = i / 96;
    return `${i ? "L" : "M"}${(x0 + (x1 - x0) * u).toFixed(1)} ${(cy - amp * Math.sin(u * Math.PI * 2)).toFixed(1)}`;
  }).join(" ");

// The same object changing state: the circle turns a quarter as it unrolls into the wave, on the word "traces".
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  const { cue } = useBeat();
  const w = Math.round(W * 0.6);
  const h = Math.round(H * 0.46);
  const r = h * 0.3;
  const from = circle(w * 0.5, h * 0.5, r);
  const to = wave(w * 0.06, w * 0.94, h * 0.5, r);
  const at = cue("traces") - 8;
  const line = prog(t, 0, 18);
  return (
    <>
      <Headline text="One turning circle traces the whole wave." t={t} at={0} maxW={Math.min(W * 0.8, safe.right - safe.left)} />
      <div style={{ position: "relative", width: w, height: h, marginTop: H * 0.06 }}>
        <div style={{ position: "absolute", left: 0, top: h / 2 - 1, width: w * line, height: 2, background: INK, opacity: 0.25 }} />
        <Morph t={t} at={at} from={from} to={to} w={w} h={h} color={ACCENT} width={5} spin style={{ position: "absolute", left: 0, top: 0 }} />
      </div>
    </>
  );
}
