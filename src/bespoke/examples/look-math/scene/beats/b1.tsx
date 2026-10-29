import { useCurrentFrame } from "remotion";
import { Plot, kf, useBeat, useFilm } from "@kit";
import { Headline } from "../components/Headline";
import { ACCENT, INK, MATH, SIZE, TEXT } from "../theme";

const TAU = Math.PI * 2;

// b1 opens the film, so the axes are already growing on frame 0. The sine plots left to right with its
// tracer; once drawn, the tracer slides back to the crest and the readout follows the same value.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  const { cue } = useBeat();
  const at = -6;
  const draw = Math.max(at + 21, cue("height") - 8);
  const drawn = draw + 39;
  const track = kf(t, [
    [drawn + 8, TAU],
    [drawn + 44, Math.PI / 2],
  ]);
  return (
    <>
      <Headline text="A wave's height rises and falls." t={t} at={-10} maxW={Math.min(W * 0.8, safe.right - safe.left)} />
      <Plot
        t={t}
        at={at}
        draw={draw}
        fn={Math.sin}
        xs={[-0.3, TAU + 0.3]}
        ys={[-1.4, 1.4]}
        w={W * 0.62}
        h={H * 0.46}
        grid={0.5}
        ink={INK}
        color={ACCENT}
        font={MATH}
        size={SIZE.label}
        ticks={{ x: [[Math.PI, "π"], [TAU, "2π"]], y: [[1, "1"], [-1, "−1"]] }}
        labels={["x", "h"]}
        track={track}
        drop
        readout={(_, y) => <span style={{ fontFamily: TEXT, fontWeight: 600, color: ACCENT }}>h = {y.toFixed(2)}</span>}
        style={{ marginTop: H * 0.06 }}
      />
    </>
  );
}
