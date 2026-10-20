"use client";

import { renderMediaOnWeb } from "@remotion/web-renderer";
import { DIMENSIONS, FPS, type VideoInput } from "@/engine/plan";
import { Video, planFrames } from "@/engine/Video";
import { pickTarget, profileOf, REMOTION_LICENSE_KEY, type RenderProfile, type Target } from "./renderTarget";

/**
 * Renders a video in this browser: every frame drawn, encoded with the
 * browser's own encoders (WebCodecs), muxed with the soundtrack. No server
 * takes part.
 */

export type ExportCheck = { ok: true; target: Target; note?: string } | { ok: false; reason: string };

export async function checkExport(format: VideoInput["format"], profile: RenderProfile = profileOf()): Promise<ExportCheck> {
  const { width, height } = DIMENSIONS[format];
  return pickTarget(width, height, profile.scale);
}

export async function exportMp4(input: VideoInput, onProgress: (p: number) => void, signal: AbortSignal, target?: Target, profile: RenderProfile = profileOf()): Promise<Blob> {
  const { width, height } = DIMENSIONS[input.format];
  const t = target ?? { container: "mp4", videoCodec: "h264", audioCodec: "aac", ext: "mp4" };
  const result = await renderMediaOnWeb({
    composition: {
      id: "video",
      component: Video,
      width,
      height,
      fps: FPS,
      durationInFrames: planFrames(input.plan),
      defaultProps: input,
    },
    inputProps: input,
    container: t.container,
    videoCodec: t.videoCodec,
    audioCodec: t.audioCodec,
    videoBitrate: profile.videoBitrate,
    hardwareAcceleration: profile.hardwareAcceleration,
    scale: profile.scale,
    licenseKey: REMOTION_LICENSE_KEY,
    signal,
    onProgress: (p) => onProgress(p.progress),
  });
  return result.getBlob();
}
