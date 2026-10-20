"use client";

import { canRenderMediaOnWeb } from "@remotion/web-renderer";

/**
 * What a video is encoded to on this machine, and how. MP4 (H.264 + AAC)
 * plays everywhere, but AAC needs the operating system's encoder, which
 * Windows N editions without the Media Feature Pack lack: there the video
 * is WebM (VP9 + Opus) instead of failing. A render profile sets the real
 * encoder parameters (output size, bitrate, hardware encoder preference).
 * Every render carries the Remotion license key when one is configured (a
 * public key by design).
 */

export type Target = { container: "mp4" | "webm"; videoCodec: "h264" | "vp9" | "vp8"; audioCodec: "aac" | "opus"; ext: "mp4" | "webm" };
export type TargetCheck = { ok: true; target: Target; note?: string } | { ok: false; reason: string };

export type RenderProfileId = "eco" | "balanced" | "quality" | "max";
export type RenderProfile = { id: RenderProfileId; label: string; about: string; scale: number; videoBitrate: "medium" | "high" | "very-high"; hardwareAcceleration: "no-preference" | "prefer-hardware" | "prefer-software" };

/** The export profiles: each changes what is encoded, not only its name. Sizes are for 1920 x 1080 compositions. */
export const PROFILES: RenderProfile[] = [
  { id: "eco", label: "Eco", about: "720p, smaller file; fastest on slow computers", scale: 2 / 3, videoBitrate: "medium", hardwareAcceleration: "prefer-hardware" },
  { id: "balanced", label: "Balanced", about: "1080p, high bitrate (the default)", scale: 1, videoBitrate: "high", hardwareAcceleration: "no-preference" },
  { id: "quality", label: "High quality", about: "1080p, very high bitrate; larger file", scale: 1, videoBitrate: "very-high", hardwareAcceleration: "no-preference" },
  { id: "max", label: "4K", about: "2160p, very high bitrate; slow and memory-hungry, needs a recent computer", scale: 2, videoBitrate: "very-high", hardwareAcceleration: "prefer-hardware" },
];

export const profileOf = (id?: string): RenderProfile => PROFILES.find((p) => p.id === id) ?? PROFILES[1];

const CANDIDATES: Target[] = [
  { container: "mp4", videoCodec: "h264", audioCodec: "aac", ext: "mp4" },
  { container: "webm", videoCodec: "vp9", audioCodec: "opus", ext: "webm" },
  { container: "webm", videoCodec: "vp8", audioCodec: "opus", ext: "webm" },
];

/** The Remotion license key for renders, or null (renders still work; Remotion logs a notice). */
export const REMOTION_LICENSE_KEY: string | null = process.env.NEXT_PUBLIC_REMOTION_LICENSE_KEY || null;

const cache = new Map<string, TargetCheck>();

/** The first format this browser can encode at this size and scale: MP4 when it can. */
export async function pickTarget(width: number, height: number, scale = 1): Promise<TargetCheck> {
  const key = `${width}x${height}@${scale}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let first: string | null = null;
  for (const t of CANDIDATES) {
    try {
      const res = await canRenderMediaOnWeb({ width, height, scale, container: t.container, videoCodec: t.videoCodec, audioCodec: t.audioCodec });
      if (res.canRender) {
        const check: TargetCheck = { ok: true, target: t, ...(t.ext === "mp4" ? {} : { note: `This computer cannot encode MP4 (${first ?? "no H.264/AAC encoder"}), so the video is WebM.` }) };
        cache.set(key, check);
        return check;
      }
      first ??= res.issues.find((i) => i.severity === "error")?.message ?? null;
    } catch (err) {
      first ??= err instanceof Error ? err.message : String(err);
    }
  }
  return { ok: false, reason: first ?? "This browser cannot encode video at this size." };
}
