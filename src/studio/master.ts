"use client";

import { registerAacEncoder } from "@mediabunny/aac-encoder";
import { ALL_FORMATS, AudioSample, AudioSampleSink, BlobSource, BufferTarget, canEncodeAudio, Conversion, Input, Mp4OutputFormat, Output, QUALITY_HIGH, WebMOutputFormat } from "mediabunny";
import { masterGain } from "@/music/loudness";

/**
 * The last step of an export: the film's sound brought to a set loudness
 * (LUFS) with a peak limiter, so every film plays back at the same level as
 * the others on a phone or a feed. The picture is copied as it is; only the
 * sound is encoded again. Runs in this browser, on the file just rendered.
 */

export type Mastered = { blob: Blob; before: number; after: number };

/** The film's sound as planar float channels, and the time of its first sample. */
async function decode(input: Input, signal?: AbortSignal) {
  const track = await input.getPrimaryAudioTrack();
  if (!track) return null;
  const parts: Float32Array[][] = [];
  let first: number | null = null;
  let sampleRate = 0;
  let channels = 0;
  for await (const sample of new AudioSampleSink(track).samples()) {
    if (signal?.aborted) {
      sample.close();
      throw new DOMException("Export canceled", "AbortError");
    }
    first ??= sample.timestamp;
    sampleRate = sample.sampleRate;
    channels = sample.numberOfChannels;
    const planes: Float32Array[] = [];
    for (let c = 0; c < channels; c++) {
      const plane = new Float32Array(sample.numberOfFrames);
      sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
      planes.push(plane);
    }
    parts.push(planes);
    sample.close();
  }
  if (!parts.length || first === null) return null;
  const length = parts.reduce((n, p) => n + p[0].length, 0);
  const out = Array.from({ length: channels }, () => new Float32Array(length));
  let at = 0;
  for (const p of parts) {
    for (let c = 0; c < channels; c++) out[c].set(p[c], at);
    at += p[0].length;
  }
  return { channels: out, sampleRate, first };
}

/**
 * Masters the sound of a rendered MP4 or WebM to `target` LUFS. Null when
 * the file has no sound, or only silence: there is nothing to level.
 */
export async function masterFilm(file: Blob, container: "mp4" | "webm", target: number, onProgress?: (p: number) => void, signal?: AbortSignal): Promise<Mastered | null> {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(file) });
  try {
    const sound = await decode(input, signal);
    if (!sound) return null;
    const m = masterGain(sound.channels, sound.sampleRate, target);
    if (!m) return null;
    const { gain } = m;
    const last = gain[gain.length - 1] ?? 1;

    const webm = container === "webm";
    const codec = webm ? "opus" : "aac";
    if (codec === "aac" && !(await canEncodeAudio("aac"))) registerAacEncoder();
    const output = new Output({ format: webm ? new WebMOutputFormat() : new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
    const conversion = await Conversion.init({
      input,
      output,
      audio: {
        codec,
        quality: QUALITY_HIGH,
        forceTranscode: true,
        process: (sample) => {
          const n = sample.numberOfFrames;
          const channels = sample.numberOfChannels;
          const start = Math.round((sample.timestamp - sound.first) * sample.sampleRate);
          const data = new Float32Array(n * channels);
          for (let c = 0; c < channels; c++) {
            const plane = data.subarray(c * n, (c + 1) * n);
            sample.copyTo(plane, { planeIndex: c, format: "f32-planar" });
            for (let i = 0; i < n; i++) plane[i] *= gain[start + i] ?? last;
          }
          return new AudioSample({ data, format: "f32-planar", numberOfChannels: channels, sampleRate: sample.sampleRate, timestamp: sample.timestamp });
        },
      },
    });
    if (!conversion.isValid) throw new Error(`The sound could not be mastered: ${conversion.discardedTracks.map((t) => t.reason).join(", ") || "unsupported file"}.`);
    if (onProgress) conversion.onProgress = (p) => onProgress(p);
    const cancel = () => void conversion.cancel();
    signal?.addEventListener("abort", cancel, { once: true });
    try {
      await conversion.execute();
    } finally {
      signal?.removeEventListener("abort", cancel);
    }
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("The mastered file came out empty.");
    return { blob: new Blob([buffer], { type: webm ? "video/webm" : "video/mp4" }), before: m.before, after: m.after };
  } finally {
    input.dispose();
  }
}
