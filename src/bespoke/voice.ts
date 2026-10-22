"use client";

import { getLine, putLine } from "@/voice/cache";
import { composeMusic, speakTimed, tuningKey, VOICE_MODEL, type SpokenWord, type VoiceTuning } from "@/voice/eleven";
import { displayWords, speech, type CharTimes, type Pronunciation, type Speech } from "@/voice/spoken";
import type { FilmSpec } from "./film";
import type { FilmBeat } from "./timing";
import { stableMusic } from "@/music/stable";

/**
 * A bespoke film's voice-over: every beat's line recorded with the person's
 * ElevenLabs key, with the time of each word, so the picture and the
 * captions follow the voice. Lines are kept in this browser and recorded
 * once per voice and wording.
 */

export type FilmVoice = { voiceId: string; voiceName: string; tuning?: VoiceTuning };

const lineKey = (voiceId: string, language: string, text: string, tuning?: VoiceTuning) => {
  const t = tuningKey(tuning);
  return `film|${VOICE_MODEL}|${voiceId}|${language}|${t ? `${t}|` : ""}${text}`;
};
const wordsKey = (key: string) => `${key}|words`;
const charsKey = (key: string) => `${key}|chars`;

async function durationOf(blob: Blob): Promise<number> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  return (await ctx.decodeAudioData(await blob.arrayBuffer())).duration;
}

/** A beat's narration as written (what the viewer reads) and as it is said. */
export type FilmLine = { i: number; display: string; speech: Speech };

/** Every beat's line: its script as written, and the text the voice is sent (pronunciations and numbers in words). */
export const filmLines = (spec: FilmSpec, language: string, lexicon: readonly Pronunciation[] = []): FilmLine[] =>
  spec.beats.flatMap((b, i) => {
    const display = b.voice?.trim();
    return display ? [{ i, display, speech: speech(display, language, lexicon) }] : [];
  });

const readJson = async <T,>(blob: Blob | undefined): Promise<T | null> => {
  if (!blob) return null;
  try {
    return JSON.parse(await blob.text()) as T;
  } catch {
    return null;
  }
};

/**
 * Records the lines not yet recorded with this voice, wording, pronunciation
 * and tuning; returns the spec timed to them and each beat's audio. A beat
 * keeps its script as `voice` (captions and cues show the words as written)
 * and the text the voice read as `tts`. `only` re-records just those beats
 * (by index) and keeps the others as they are.
 */
export async function recordFilmVoice(o: {
  spec: FilmSpec;
  language: string;
  apiKey: string;
  voice: FilmVoice;
  lexicon?: readonly Pronunciation[];
  only?: number[];
  signal?: AbortSignal;
  onLine?: (done: number, total: number) => void;
}): Promise<{ spec: FilmSpec; clips: Record<number, Blob> }> {
  const lines = filmLines(o.spec, o.language, o.lexicon).filter((l) => !o.only || o.only.includes(l.i));
  const clips: Record<number, Blob> = {};
  const timed: Record<number, { tts: string; seconds: number; words: SpokenWord[] }> = {};
  let done = 0;
  const queue = [...lines];
  // Two at a time: quicker than one by one, within ElevenLabs' concurrency on every plan.
  const worker = async () => {
    for (let line = queue.shift(); line; line = queue.shift()) {
      const tts = line.speech.tts;
      const key = lineKey(o.voice.voiceId, o.language, tts, o.voice.tuning);
      let audio = await getLine(key);
      let chars = await readJson<CharTimes>(await getLine(charsKey(key)));
      let words = (await readJson<SpokenWord[]>(await getLine(wordsKey(key)))) ?? [];
      if (!audio || (!chars && !words.length)) {
        o.signal?.throwIfAborted();
        const r = await speakTimed(o.apiKey, o.voice.voiceId, tts, o.language, o.signal, o.voice.tuning);
        audio = r.audio;
        words = r.words;
        chars = r.chars;
        await putLine(key, audio);
        await putLine(wordsKey(key), new Blob([JSON.stringify(words)], { type: "application/json" }));
        if (chars) await putLine(charsKey(key), new Blob([JSON.stringify(chars)], { type: "application/json" }));
      }
      clips[line.i] = audio;
      // The words as written, at the times the voice says them; without character times, the spoken words.
      timed[line.i] = { tts, seconds: Math.round((await durationOf(audio)) * 100) / 100, words: chars ? displayWords(line.speech, chars) : words };
      o.onLine?.(++done, lines.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return {
    spec: { ...o.spec, beats: o.spec.beats.map((b, i) => (timed[i] ? { ...b, tts: timed[i].tts, voiceSeconds: timed[i].seconds, words: timed[i].words } : b)) },
    clips,
  };
}

/** A beat's line without its recording: it times the picture again by estimate until it is recorded. */
export const unrecorded = (b: FilmBeat): FilmBeat => {
  const rest = { ...b };
  delete rest.tts;
  delete rest.voiceSeconds;
  delete rest.words;
  return rest;
};

/** A film's recorded lines from this browser's store, or null when any is missing. */
export async function storedFilmVoice(spec: FilmSpec, language: string, voice: FilmVoice): Promise<Record<number, Blob> | null> {
  const clips: Record<number, Blob> = {};
  for (const [i, b] of spec.beats.entries()) {
    if (!b.voice?.trim() || !b.words?.length) continue;
    // A recorded beat holds the text the voice read (films made before pronunciations kept it in `voice`).
    const audio = await getLine(lineKey(voice.voiceId, language, (b.tts ?? b.voice).trim(), voice.tuning));
    if (!audio) return null;
    clips[i] = audio;
  }
  return clips;
}

/** Where a made-for-the-film music bed comes from. */
export type MusicSource = { provider: "elevenlabs" | "stableaudio"; key: string };

// ElevenLabs beds keep their old key, so beds made before Stable Audio came in are still found.
const musicKey = (provider: MusicSource["provider"], prompt: string, seconds: number) => `film-music|${provider === "elevenlabs" ? "music_v1" : "stable-audio-v3"}|${Math.round(seconds)}|${prompt}`;

/** What the music bed is asked to be: the film's world and mood, restrained under the picture. */
export function musicPrompt(o: { style: string; metaphor: string; genre: string; bpm: number }): string {
  return `${o.style}; ${o.metaphor}. A ${o.genre.replace("-", " ")} feel, about ${o.bpm} BPM. Instrumental only, no vocals. A restrained, premium modern launch-film score that sits under a voice-over: it starts on the beat, builds gently, never gets bombastic, and ends on one clean hit about two seconds before the end with a short tail.`;
}

/**
 * A music bed made for this film (ElevenLabs Music on a paid plan, or Stable Audio with a
 * stableaudio.com token), made once per prompt and length and kept in this browser. Throws when the
 * provider refuses (402 on ElevenLabs' free plan, an expired Stable Audio token).
 */
export async function filmMusic(o: { source: MusicSource; prompt: string; seconds: number; signal?: AbortSignal }): Promise<{ key: string; blob: Blob }> {
  const key = musicKey(o.source.provider, o.prompt, o.seconds);
  const hit = await getLine(key);
  if (hit) return { key, blob: hit };
  const blob = o.source.provider === "stableaudio" ? await stableMusic(o.source.key, o.prompt, o.seconds, o.signal) : await composeMusic(o.source.key, o.prompt, o.seconds, o.signal);
  await putLine(key, blob);
  return { key, blob };
}

/** A film's music bed from this browser's store, when it was made here. */
export const storedFilmMusic = (key: string) => getLine(key);
