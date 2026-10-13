import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Chars, Grain, Mark, Sfx, flyE, kf, outE, prog, useFilm, useHits } from "@kit";
import { INK, PAPER } from "./components/palette";
import { World } from "./components/World";

export const fonts = { "Space Grotesk": ["500", "700"], Kalam: ["400", "700"], "JetBrains Mono": ["400", "700"] };
export const background = "#F4F2EC";

type Cam = [x: number, y: number, zoom: number];

/** One headline at a time, top left, on a strip of paper so the sketch never runs through it. */
const Headline = ({ text, at, out, t }: { text: string; at: number; out: number; t: number }) => {
  if (t < at - 2 || t > out + 8) return null;
  const leave = prog(t, out - 6, out + 6);
  return (
    <div style={{ position: "absolute", left: 100, top: 84, padding: "14px 26px 18px", background: PAPER, borderRadius: 6, opacity: 1 - leave, transform: `translateY(${-leave * 24}px)` }}>
      <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 84, color: INK, letterSpacing: "-0.02em", lineHeight: 1.05 }}>
        <Chars text={text} t={t} at={at} step={1.3} mode="rise" />
      </div>
    </div>
  );
};

export default function Scene() {
  const t = useCurrentFrame();
  const { W, H, cue, brand } = useFilm();
  const accent = brand.colors[0] ?? "#FF4F1F";
  const [b2, b3, b4, b5] = [cue("b2"), cue("b3"), cue("b4"), cue("b5")];

  // The camera over one sketched world: wide on the mess, in on the gateway, across to the models, down to the code, out for everything.
  const cams: [number, Cam][] = [
    [0, [1700, 900, 0.58]],
    [b2 - 8, [1740, 930, 0.62]],
    [b2 + 12, [1460, 900, 0.8]],
    [b3 - 8, [1500, 900, 0.82]],
    [b3 + 14, [2060, 880, 0.7]],
    [b4 - 8, [2080, 880, 0.71]],
    [b4 + 14, [1520, 1120, 0.6]],
    [b5 - 8, [1500, 1110, 0.61]],
    [b5 + 18, [1640, 960, 0.5]],
  ];
  const axis = (k: 0 | 1 | 2) => kf(t, cams.map(([f, c], i) => [f, c[k], i ? flyE : undefined]));
  const hits = useHits(
    [
      { at: b2 + 2, kind: "punch", amp: 0.03 },
      { at: b2 + 2, kind: "shake", amp: 6 },
      { at: b3 + 4, kind: "punch" },
      { at: b4 + 40, kind: "punch", amp: 0.025 },
    ],
    t,
  );
  const zoom = axis(2) * hits.scale;
  const clear = prog(t, cue("b5@0.4"), cue("b5@0.4") + 14, outE);

  return (
    <AbsoluteFill>
      <div style={{ position: "absolute", left: 0, top: 0, width: 0, height: 0, transform: `translate(${W / 2 + hits.x}px, ${H / 2 + hits.y}px) scale(${zoom}) translate(${-axis(0)}px, ${-axis(1)}px)` }}>
        <World t={t} accent={accent} />
      </div>

      <Headline text="AI infrastructure gets complicated." at={cue("b1@0.45")} out={b2 - 2} t={t} />
      <Headline text="One gateway." at={b2 + 6} out={b3 - 2} t={t} />
      <Headline text="Many models." at={b3 + 8} out={b4 - 2} t={t} />
      <Headline text="Connect once. Switch freely." at={b4 + 6} out={b5 - 2} t={t} />

      {/* The close: the sketch clears to paper and the brand settles in. */}
      {clear > 0 ? (
        <AbsoluteFill style={{ background: PAPER, opacity: clear, alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 34, transform: `translateY(${(1 - prog(t, cue("b5@0.45"), cue("b5@0.45") + 20)) * 30}px)`, opacity: prog(t, cue("b5@0.45"), cue("b5@0.45") + 12) }}>
            <Mark size={130} />
            <div style={{ fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 128, color: INK, letterSpacing: "-0.03em" }}>{brand.name}</div>
          </div>
          <div style={{ fontFamily: "Kalam", fontWeight: 700, fontSize: 56, color: accent, opacity: prog(t, cue("b5@0.55"), cue("b5@0.55") + 12) }}>One key. Many models.</div>
          <div style={{ fontFamily: "JetBrains Mono", fontSize: 34, color: INK, opacity: 0.7 * prog(t, cue("b5@0.62"), cue("b5@0.62") + 12) }}>{brand.url}</div>
        </AbsoluteFill>
      ) : null}
      <Grain opacity={0.05} />

      <Sfx name="whoosh" at={b2 - 10} volume={0.35} />
      <Sfx name="impact" at={b2} volume={0.3} />
      <Sfx name="whoosh" at={b3 - 6} volume={0.3} />
      <Sfx name="swoosh" at={b4 - 4} volume={0.35} />
      <Sfx name="whoosh" at={b5 - 4} volume={0.3} />
      <Sfx name="ding" at={cue("b5@0.45")} volume={0.35} />
    </AbsoluteFill>
  );
}
