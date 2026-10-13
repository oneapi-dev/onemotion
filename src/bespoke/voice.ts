"use client";

import { getLine, putLine } from "@/voice/cache";
import { speakTimed, VOICE_MODEL, type SpokenWord } from "@/voice/eleven";
import { spoken } from "@/voice/spoken";
import type { FilmSpec } from "./film";

/**
 * A bespoke film's voice-over: every beat's line recorded with the person's
 * ElevenLabs key, with the time of each word, so the picture and the
 * captions follow the voice. Lines are kept in this browser and recorded
 * once per voice and wording.
 */

export type FilmVoice = { voiceId: string; voiceName: string };

const lineKey = (voiceId: string, language: string, text: string) => `film|${VOICE_MODEL}|${voiceId}|${language}|${text}`;
const wordsKey = (key: string) => `${key}|words`;

async function durationOf(blob: Blob): Promise<number> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  return (await ctx.decodeAudioData(await blob.arrayBuffer())).duration;
}

const linesOf = (spec: FilmSpec, language: string) => spec.beats.flatMap((b, i) => (b.voice?.trim() ? [{ i, text: spoken(b.voice.trim(), language) }] : []));

/** Records the lines not yet recorded with this voice; returns the spec timed to them and each beat's audio. */
export async function recordFilmVoice(o: { spec: FilmSpec; language: string; apiKey: string; voice: FilmVoice; signal?: AbortSignal; onLine?: (done: number, total: number) => void }): Promise<{ spec: FilmSpec; clips: Record<number, Blob> }> {
  const lines = linesOf(o.spec, o.language);
  const clips: Record<number, Blob> = {};
  const timed: Record<number, { text: string; seconds: number; words: SpokenWord[] }> = {};
  let done = 0;
  const queue = [...lines];
  // Two at a time: quicker than one by one, within ElevenLabs' concurrency on every plan.
  const worker = async () => {
    for (let line = queue.shift(); line; line = queue.shift()) {
      const key = lineKey(o.voice.voiceId, o.language, line.text);
      let audio = await getLine(key);
      const cachedWords = await getLine(wordsKey(key));
      let words: SpokenWord[] = cachedWords ? (JSON.parse(await cachedWords.text()) as SpokenWord[]) : [];
      if (!audio || !cachedWords) {
        const r = await speakTimed(o.apiKey, o.voice.voiceId, line.text, o.language, o.signal);
        audio = r.audio;
        words = r.words;
        await putLine(key, audio);
        await putLine(wordsKey(key), new Blob([JSON.stringify(words)], { type: "application/json" }));
      }
      clips[line.i] = audio;
      timed[line.i] = { text: line.text, seconds: Math.round((await durationOf(audio)) * 100) / 100, words };
      o.onLine?.(++done, lines.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return {
    spec: { ...o.spec, beats: o.spec.beats.map((b, i) => (timed[i] ? { ...b, voice: timed[i].text, voiceSeconds: timed[i].seconds, words: timed[i].words } : b)) },
    clips,
  };
}

/** A film's recorded lines from this browser's store, or null when any is missing. */
export async function storedFilmVoice(spec: FilmSpec, language: string, voice: FilmVoice): Promise<Record<number, Blob> | null> {
  const clips: Record<number, Blob> = {};
  for (const b of spec.beats.map((x, i) => ({ x, i }))) {
    if (!b.x.voice?.trim() || !b.x.words?.length) continue;
    // A recorded beat already holds its spoken text, so it maps to the same key.
    const audio = await getLine(lineKey(voice.voiceId, language, b.x.voice.trim()));
    if (!audio) return null;
    clips[b.i] = audio;
  }
  return clips;
}
