import { Audio } from "@remotion/media";
import { useMemo } from "react";
import { Sequence, staticFile } from "remotion";
import { composeTrack } from "../music/render";
import { hashOf } from "../music/rng";
import { scoreOf } from "../music/score";
import { useTrack } from "../music/useTrack";
import { AUDIO_EXT } from "./music";
import type { Plan } from "./plan";
import { VOICE_LEAD, moveWindow, type Timing } from "./rig";
import { chatTimes, checkTimes, kineticTimes } from "./timing";

const file = (name: string) => staticFile(`audio/${name}.${AUDIO_EXT}`);

type Hit = { name: string; at: number; volume: number; frames?: number };

/**
 * The soundtrack: music composed for this video from its score (hits on
 * every card landing, build-ups, the close), rendered in the page; over it,
 * a whoosh on every camera move and the cues each card plays (typing, pops,
 * a ding when a number lands). Effects start two frames early: sound that
 * leads the picture reads as in sync.
 */
/** How far the music dips while the voiceover speaks (about -8 dB), and how many frames the dip takes. */
const DUCK = 0.4;
const DUCK_FRAMES = 6;

export const Soundtrack: React.FC<{ plan: Plan; timing: Timing; voiceover?: Record<number, string> }> = ({ plan, timing, voiceover }) => {
  const t = timing;
  const score = useMemo(() => scoreOf(plan), [plan]);
  const key = `${hashOf(JSON.stringify(score))}:${t.total}:${t.startBeats.join(",")}`;
  const track = useTrack(key, () => composeTrack(score, t));
  // Each recorded line starts just after its card lands, and the music dips under it.
  const lead = Math.round(VOICE_LEAD * 30);
  const lines = plan.scenes.flatMap((s, i) => {
    const src = voiceover?.[i];
    if (!src || !s.narration_seconds) return [];
    const from = t.starts[i] + lead;
    return [{ src, from, to: from + Math.ceil(s.narration_seconds * 30) }];
  });
  const musicLevel = (f: number) => {
    let dip = 0;
    for (const l of lines) {
      const into = Math.min(1, Math.max(0, (f - (l.from - DUCK_FRAMES)) / DUCK_FRAMES));
      const out = Math.min(1, Math.max(0, (l.to + DUCK_FRAMES - f) / DUCK_FRAMES));
      dip = Math.max(dip, Math.min(into, out));
    }
    return 0.9 * (1 - (1 - DUCK) * dip);
  };
  const hits: Hit[] = [];
  plan.scenes.forEach((scene, i) => {
    const [leave] = moveWindow(i, t);
    if (i > 0) hits.push({ name: t.move < 18 ? "swoosh" : "whoosh", at: leave - 2, volume: 0.36 });
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

  return (
    <>
      {track ? <Audio src={track} volume={lines.length ? musicLevel : 0.9} /> : null}
      {lines.map((l, i) => (
        <Sequence key={`voice-${i}`} from={l.from} durationInFrames={l.to - l.from + 15}>
          <Audio src={l.src} volume={1} />
        </Sequence>
      ))}
      {hits.map((h, i) => (
        <Sequence key={i} from={Math.max(0, h.at)} durationInFrames={h.frames ?? 90}>
          <Audio src={file(h.name)} volume={h.volume} />
        </Sequence>
      ))}
    </>
  );
};
