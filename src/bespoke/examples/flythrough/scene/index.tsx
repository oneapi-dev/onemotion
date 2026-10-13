import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Billboard3D, Floor3D, Mark, Particles3D, camAt, flyE, useFilm, type Cam3 } from "@kit";

export const fonts = { "Space Grotesk": ["700"] };
export const background = "#EDEBE6";

const CARDS = [
  { p: { x: -500, y: 0, z: 1200 }, text: "One key." },
  { p: { x: 500, y: -120, z: 3000 }, text: "Every model." },
  { p: { x: 0, y: 0, z: 4800 }, text: "" },
];

export default function Scene() {
  const t = useCurrentFrame();
  const { cue } = useFilm();
  const cam = (f: number): Cam3 =>
    camAt(
      [
        [0, { x: -500, y: 0, z: 0, r: 0 }],
        [cue("b2") - 14, { x: -470, y: 0, z: 60, r: 0 }],
        [cue("b2") + 8, { x: 500, y: -120, z: 1800, r: 0 }, flyE],
        [cue("b3") - 14, { x: 480, y: -120, z: 1860, r: 0 }],
        [cue("b3") + 8, { x: 0, y: 0, z: 3600, r: 0 }, flyE],
      ],
      f,
    );
  const c = cam(t);
  return (
    <AbsoluteFill>
      <Floor3D cam={c} y={420} />
      <Particles3D cam={c} prev={cam(t - 1)} n={90} />
      {[...CARDS].reverse().map((card, i) => (
        <Billboard3D key={i} cam={c} p={card.p} w={900} h={500} focusZ={c.z + 1200}>
          <div style={{ width: 900, height: 500, borderRadius: 28, background: "#151515", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", gap: 30, fontFamily: "Space Grotesk", fontWeight: 700, fontSize: 96 }}>
            {card.text || (
              <>
                <Mark size={110} /> OneAPI
              </>
            )}
          </div>
        </Billboard3D>
      ))}
    </AbsoluteFill>
  );
}
