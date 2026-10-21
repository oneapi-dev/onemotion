import { useCurrentFrame } from "remotion";
import { kf, moveE, useFilm, useWorld } from "@kit";
import { ACCENT } from "../theme";

/**
 * The trip's pin, the film's one thread. A child of <World>, so it lives in world pixels and never
 * fades out: it waits in each station (clear of the words, given in that station's frame pixels) and
 * rides to the next one with the camera, landing as the next beat's words arrive.
 */
export const Pin = () => {
  const t = useCurrentFrame();
  const { W, H, cue } = useFilm();
  const { at } = useWorld();
  const stops = [at("b1", W * 0.5, H * 0.76), at("b2", W * 0.5, H * 0.9), at("b3", W * 0.5, H * 0.18)];
  const ride = (axis: "x" | "y") =>
    kf(t, [
      [cue("b2") - 12, stops[0][axis]],
      [cue("b2") + 14, stops[1][axis], moveE],
      [cue("b3") - 12, stops[1][axis]],
      [cue("b3") + 14, stops[2][axis], moveE],
    ]);
  const r = 16;
  return <div style={{ position: "absolute", left: ride("x") - r, top: ride("y") - r, width: r * 2, height: r * 2, borderRadius: "50%", background: ACCENT, boxShadow: `0 0 0 10px ${ACCENT}26` }} />;
};
