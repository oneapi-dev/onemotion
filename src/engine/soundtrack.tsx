import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";
import { renderProbe } from "../music/probe";
import { useTrack } from "../music/useTrack";
import { encodeWav } from "../music/wav";
import { AUDIO_EXT } from "./music";
import type { Plan } from "./plan";
import { moveWindow, type Timing } from "./rig";
import { chatTimes, checkTimes, kineticTimes } from "./timing";

const file = (name: string) => staticFile(`audio/${name}.${AUDIO_EXT}`);

type Hit = { name: string; at: number; volume: number; frames?: number };

/**
 * The score: the bed from the bar that lines its breakdown up with the
 * close, a riser into the close and the track's own ending hit on it; under
 * the picture, a whoosh on every camera move and the cues each card plays
 * (ticks, typing, a ding when a number lands). Effects start two frames
 * early: sound that leads the picture reads as in sync.
 */
export const Soundtrack: React.FC<{ plan: Plan; timing: Timing }> = ({ plan, timing }) => {
  const t = timing;
  // Spike: a probe in place of the bed, beeping at 0.5 s and on every card landing.
  const beeps = [0.5, ...plan.scenes.map((_, i) => moveWindow(i, t)[1] / 30)];
  const key = `probe:${t.total}:${beeps.join(",")}`;
  const track = useTrack(key, async () => encodeWav(await renderProbe(t.total / 30, beeps)));
  const hits: Hit[] = [{ name: "impact", at: 0, volume: 0.55 }];
  plan.scenes.forEach((scene, i) => {
    const [leave, land] = moveWindow(i, t);
    if (i > 0) hits.push({ name: t.move < 18 ? "swoosh" : "whoosh", at: leave - 2, volume: 0.42 });
    if (i > 0 && i < plan.scenes.length - 1) hits.push({ name: "tick", at: land - 2, volume: 0.35 });
    const s = t.starts[i];
    const items = scene.items ?? [];
    switch (scene.type) {
      case "announce":
      case "stat":
      case "offer":
        hits.push({ name: "ding", at: s + 8, volume: 0.3 });
        break;
      case "checklist":
        for (const c of checkTimes(items.length, t.frames[i])) hits.push({ name: "pop", at: s + c + 4, volume: 0.32 });
        break;
      case "chat":
        for (const c of chatTimes(items, t.frames[i])) hits.push({ name: "pop", at: s + c.at - 2, volume: 0.28 });
        break;
      case "kinetic":
        for (const c of kineticTimes(items.length, t.frames[i]).slice(1)) hits.push({ name: "swoosh", at: s + c - 2, volume: 0.3 });
        break;
      case "code":
        for (let at = s + 14; at < s + Math.round(t.frames[i] * 0.62); at += 45) hits.push({ name: "type", at, volume: 0.22, frames: 45 });
        break;
      case "bars":
      case "specs":
        hits.push({ name: "ding", at: s + 40, volume: 0.24 });
        break;
    }
  });
  const riserFrames = 66;
  if (t.closeAt > riserFrames + 30) hits.push({ name: "riser", at: t.closeAt - riserFrames, volume: 0.42, frames: riserFrames + 4 });

  return (
    <>
      {track ? <Audio src={track} /> : null}
      {hits.map((h, i) => (
        <Sequence key={i} from={Math.max(0, h.at)} durationInFrames={h.frames ?? 90}>
          <Audio src={file(h.name)} volume={h.volume} />
        </Sequence>
      ))}
    </>
  );
};
