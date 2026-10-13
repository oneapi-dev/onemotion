import type { Timing } from "../engine/rig";
import type { Score } from "../music/score";
import type { SpokenWord } from "../voice/eleven";
import type { Beat, BeatWord } from "./kit/film";

export const FILM_FPS = 30;

/** One beat of a bespoke film, as the concept writes it. */
export type FilmBeat = {
  id: string;
  says: string;
  shows: string;
  /** How long the beat wants to be. */
  seconds: number;
  /** Its voice-over line, as spoken (numbers as words). */
  voice?: string;
  /** Length of its recorded voice-over line, when there is one: the beat is never shorter. */
  voiceSeconds?: number;
  /** When each word of the recording is spoken, in seconds from the start of the line. */
  words?: SpokenWord[];
};

/** Seconds after a beat starts before its voice-over line: the hit first, then the voice. */
export const VOICE_LEAD = 0.2;

const MIN_BEAT_SECONDS = 0.8;

/**
 * A beat's words in frames. A recorded line gives the real times; without
 * one, the line (or the on-screen words) is spread over the beat by length,
 * so a cue on a word still lands where that word would be said.
 */
function wordFrames(b: FilmBeat, start: number, end: number): BeatWord[] {
  const lead = start + VOICE_LEAD * FILM_FPS;
  if (b.words?.length) return b.words.map((w) => ({ text: w.text, at: Math.round(lead + w.start * FILM_FPS), end: Math.round(lead + w.end * FILM_FPS) }));
  const toks = (b.voice || b.says).split(/\s+/).filter(Boolean);
  const chars = toks.reduce((a, w) => a + w.length + 1, 0) || 1;
  const span = Math.max(1, Math.min(end - lead - 6, toks.length * 0.42 * FILM_FPS));
  let acc = 0;
  return toks.map((text) => {
    const at = Math.round(lead + (acc / chars) * span);
    acc += text.length + 1;
    return { text, at, end: Math.round(lead + (acc / chars) * span) };
  });
}

/**
 * The film's beats in frames, and the same grid as a music Timing. The
 * music is composed for the film, so beats snap to it: each starts on a beat
 * of the score's tempo and lasts a whole, even number of them, the last one
 * starts on a bar line and holds at least two bars for the close.
 */
export function filmTiming(beats: FilmBeat[], score: Pick<Score, "bpm">): { timing: Timing; beats: Beat[] } {
  const n = Math.max(1, beats.length);
  const beat = (FILM_FPS * 60) / score.bpm;
  const lengths = beats.map((b, i) => {
    const want = Math.max(MIN_BEAT_SECONDS, b.seconds, b.voiceSeconds ? b.voiceSeconds + VOICE_LEAD + 0.4 : 0);
    const k = Math.max(i === n - 1 ? 8 : 2, Math.round((want * FILM_FPS) / beat));
    return i === n - 1 ? k : k + (k % 2);
  });
  if (n > 1) {
    const before = lengths.slice(0, n - 1).reduce((a, b) => a + b, 0);
    if (before % 4) lengths[n - 2] += 4 - (before % 4);
  }
  const startBeats: number[] = [];
  lengths.reduce((at, k) => {
    startBeats.push(at);
    return at + k;
  }, 0);
  const sum = lengths.reduce((a, b) => a + b, 0);
  const starts = startBeats.map((b) => Math.round(b * beat));
  const total = Math.max(1, Math.round(sum * beat));
  const frames = starts.map((s, i) => (i < n - 1 ? starts[i + 1] : total) - s);
  const timing: Timing = { bpm: score.bpm, beat, startBeats, beats: lengths, starts, frames, total, closeAt: starts[n - 1] ?? 0, move: 18 };
  return {
    timing,
    beats: beats.map((b, i) => ({ id: b.id, says: b.says, shows: b.shows, voice: b.voice ?? "", spoken: Boolean(b.words?.length), start: starts[i], end: starts[i] + frames[i], words: wordFrames(b, starts[i], starts[i] + frames[i]) })),
  };
}
