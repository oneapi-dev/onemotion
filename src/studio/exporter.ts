"use client";

import { canRenderMediaOnWeb, renderMediaOnWeb } from "@remotion/web-renderer";
import { DIMENSIONS, FPS, type VideoInput } from "@/engine/plan";
import { Video, planFrames } from "@/engine/Video";

/**
 * Renders a video to MP4 in this browser: every frame drawn, encoded with
 * the browser's own H.264 encoder (WebCodecs), muxed with the soundtrack.
 * No server takes part.
 */

export type ExportCheck = { ok: true } | { ok: false; reason: string };

export async function checkExport(format: VideoInput["format"]): Promise<ExportCheck> {
  const { width, height } = DIMENSIONS[format];
  try {
    const res = await canRenderMediaOnWeb({ width, height, container: "mp4", videoCodec: "h264" });
    if (res.canRender) return { ok: true };
    const issue = res.issues.find((i) => i.severity === "error");
    return { ok: false, reason: issue?.message ?? "This browser cannot encode MP4." };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : "This browser cannot encode MP4." };
  }
}

export async function exportMp4(input: VideoInput, onProgress: (p: number) => void, signal: AbortSignal): Promise<Blob> {
  const { width, height } = DIMENSIONS[input.format];
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
    container: "mp4",
    videoCodec: "h264",
    videoBitrate: "high",
    signal,
    onProgress: (p) => onProgress(p.progress),
  });
  return result.getBlob();
}
