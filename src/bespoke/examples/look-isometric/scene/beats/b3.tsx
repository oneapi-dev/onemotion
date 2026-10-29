import { useCurrentFrame } from "remotion";
import { IsoBlock, IsoExplode, IsoScene, explode, iso, prog, useBeat, useFilm } from "@kit";
import { Headline } from "../components/Headline";
import { Label } from "../components/Model";
import { ACCENT, BLOCK, INK } from "../theme";

const LAYERS = ["Ingest", "Model", "Forecast"];
const H1 = 0.7;
const GAP = 0.9;

// The server, closer: its three layers part on "layers", each named beside its right face, and close again before the cut.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  const { cue, len } = useBeat();
  const open = cue("layers") - 4;
  const back = len - 34;
  const u = Math.min(W / 22, H / 12);
  const w = W * 0.5;
  const h = H * 0.6;
  const ox = w * 0.42;
  const oy = h * 0.66;
  const k = explode(t, open, 24, back);
  return (
    <>
      <Headline text="Inside, three layers turn them into a forecast." t={t} at={0} maxW={Math.min(W * 0.8, safe.right - safe.left)} />
      <IsoScene t={t} u={u} w={w} h={h} ox={ox} oy={oy}>
        <IsoExplode t={t} at={open} back={back} gap={GAP}>
          {LAYERS.map((name, i) => (
            <IsoBlock key={name} x={-1} y={-1} z={i * H1} w={2} d={2} h={H1} color={i === 2 ? ACCENT : BLOCK} t={t} at={-100} />
          ))}
        </IsoExplode>
        {LAYERS.map((name, i) => {
          // A tag beside each layer's right face, riding with it as the view opens.
          const p = iso(1, 0, i * H1 + i * GAP * k + H1 / 2, u);
          const o = prog(t, open + 14 + i * 4, open + 24 + i * 4) * (1 - prog(t, back, back + 10));
          return o > 0 ? (
            <div key={name} style={{ position: "absolute", left: ox + p.x + u * 0.5, top: oy + p.y, zIndex: 100_000, opacity: o, transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 14 }}>
              <div style={{ width: u * 0.9, height: 2, background: `${INK}55` }} />
              <Label>{name}</Label>
            </div>
          ) : null;
        })}
      </IsoScene>
    </>
  );
}
