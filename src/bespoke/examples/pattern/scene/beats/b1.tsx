import { useCurrentFrame } from "remotion";
import { Sfx, useBeat, useFilm } from "@kit";
import { Headline } from "../components/Headline";

// b1 opens the film, so its first frame is the thumbnail: the headline starts already rising.
// A station is a centred flex column inside the safe area: the headline is laid out by flex, not placed at guessed pixels.
export default function Beat() {
  const t = useCurrentFrame();
  const { W, safe } = useFilm();
  const { cue } = useBeat();
  const place = cue("place"); // the frame the voice says "place": the line lands on it
  return (
    <>
      <Headline text="Your whole trip, in one place." t={t} at={-30} maxW={Math.min(W * 0.8, safe.right - safe.left)} />
      <Sfx name="marker" at={0} volume={0.3} />
      <Sfx name="pop" at={place - 1} volume={0.25} />
    </>
  );
}
