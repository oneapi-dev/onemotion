"use client";

import { Player } from "@remotion/player";
import { DIMENSIONS, FPS, type VideoInput } from "@/engine/plan";
import { Video, planFrames } from "@/engine/Video";

/** The live preview: the exact composition the exporter renders, drawn in the browser. */
export default function Preview({ input }: { input: VideoInput }) {
  const { width, height } = DIMENSIONS[input.format];
  return (
    <Player
      component={Video}
      inputProps={input}
      durationInFrames={planFrames(input.plan)}
      fps={FPS}
      compositionWidth={width}
      compositionHeight={height}
      controls
      loop
      autoPlay
      clickToPlay
      acknowledgeRemotionLicense
      style={{ width: "100%", aspectRatio: `${width} / ${height}`, display: "block" }}
    />
  );
}
