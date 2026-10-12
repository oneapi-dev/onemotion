import { Audio } from "@remotion/media";
import { Sequence, interpolate, staticFile } from "remotion";
import { AUDIO_EXT } from "./music";
import type { Plan } from "./plan";
import { moveWindow, type Timing } from "./rig";
import { chatTimes, checkTimes, kineticTimes } from "./timing";

const file = (name: string) => staticFile(`audio/${name}.${AUDIO_EXT}`);
const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

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
  const fadeAt = t.closeAt;
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
      <Audio
        src={file(t.music)}
        trimBefore={Math.round(t.musicFrom * 30)}
        volume={(f) => interpolate(f, [0, 6, fadeAt - 4, fadeAt + 4], [0, 0.62, 0.62, 0], clamp)}
      />
      <Sequence from={Math.max(0, t.closeAt - 1)}>
        <Audio src={file(`${t.music}-end`)} volume={0.8} />
      </Sequence>
      {hits.map((h, i) => (
        <Sequence key={i} from={Math.max(0, h.at)} durationInFrames={h.frames ?? 90}>
          <Audio src={file(h.name)} volume={h.volume} />
        </Sequence>
      ))}
    </>
  );
};
