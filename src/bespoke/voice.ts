"use client";

import { getLine, putLine } from "@/voice/cache";
import { composeMusic, speakTimed, VOICE_MODEL, type SpokenWord } from "@/voice/eleven";
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

const musicKey = (prompt: string, seconds: number) => `film-music|music_v1|${Math.round(seconds)}|${prompt}`;

/** What the music bed is asked to be: the film's world and mood, restrained under the picture. */
export function musicPrompt(o: { style: string; metaphor: string; genre: string; bpm: number }): string {
  return `${o.style}; ${o.metaphor}. A ${o.genre.replace("-", " ")} feel, about ${o.bpm} BPM. Instrumental only, no vocals. A restrained, premium modern launch-film score that sits under a voice-over: it starts on the beat, builds gently, never gets bombastic, and ends on one clean hit about two seconds before the end with a short tail.`;
}

/** A music bed from ElevenLabs Music for this film, made once per prompt and length and kept in this browser. Throws (402) without a paid plan. */
export async function filmMusic(o: { apiKey: string; prompt: string; seconds: number; signal?: AbortSignal }): Promise<{ key: string; blob: Blob }> {
  const key = musicKey(o.prompt, o.seconds);
  const hit = await getLine(key);
  if (hit) return { key, blob: hit };
  const blob = await composeMusic(o.apiKey, o.prompt, o.seconds, o.signal);
  await putLine(key, blob);
  return { key, blob };
}

/** A film's music bed from this browser's store, when it was made here. */
export const storedFilmMusic = (key: string) => getLine(key);
