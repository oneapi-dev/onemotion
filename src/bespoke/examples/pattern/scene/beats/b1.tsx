import { useCurrentFrame } from "remotion";
import { Sfx, prog, useBeat, useFilm } from "@kit";
import { Headline } from "../components/Headline";
import { STAGE } from "../theme";

// b1 opens the film, so its first frame is the thumbnail: the headline starts already rising.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, H, safe } = useFilm();
  const { cue, len } = useBeat();
  const place = cue("place"); // the frame the voice says "place": the line lands on it
  const exit = prog(t, len - 2, len + 10); // leaves during the overlap, while b2 arrives
  return (
    <div style={{ position: "absolute", left: safe.left, top: H * STAGE.top, width: safe.right - safe.left, opacity: 1 - exit, transform: `translateY(${-exit * 40}px)` }}>
      <Headline text="Your whole trip, in one place." t={t} at={-6} maxW={Math.min(W * 0.8, safe.right - safe.left)} />
      <Sfx name="marker" at={0} volume={0.3} />
      <Sfx name="pop" at={place - 1} volume={0.25} />
    </div>
  );
}
