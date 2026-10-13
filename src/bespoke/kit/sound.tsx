import { Audio } from "@remotion/media";
import { Sequence, staticFile } from "remotion";

/** The sound effects a scene can place. */
export const SFX = ["whoosh", "swoosh", "impact", "riser", "tick", "pop", "ding", "type", "click"] as const;
export type SfxName = (typeof SFX)[number];

/**
 * A sound effect starting at frame `at`. Put one on every move, hit, click
 * and connection the picture makes; sound a frame or two before the picture
 * reads as in sync. `type` is a second and a half of keystrokes.
 */
export const Sfx = ({ name, at, volume = 0.5 }: { name: SfxName; at: number; volume?: number }) => {
  if (!SFX.includes(name) || !Number.isFinite(at)) return null;
  return (
    <Sequence from={Math.max(0, Math.round(at))} durationInFrames={name === "riser" || name === "impact" ? 90 : 60} layout="none">
      <Audio src={staticFile(`audio/${name}.mp3`)} volume={Math.max(0, Math.min(1, volume))} />
    </Sequence>
  );
};
