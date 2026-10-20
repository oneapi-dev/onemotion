import type { Plan } from "@/engine/plan";
import { getLine, putLine } from "./cache";
import { speak, tuningKey, VOICE_MODEL, type VoiceTuning } from "./eleven";
import { spoken, type Pronunciation } from "./spoken";

/** Which voice read a video: kept with the project, so its lines are found again whatever Settings say later. */
export type VoiceChoice = { voiceId: string; voiceName: string; tuning?: VoiceTuning };

/** A recorded voiceover: the plan, timed to its lines, and each scene's line as audio. */
export type Narration = { plan: Plan; clips: Record<number, Blob> };

const lineKey = (voice: VoiceChoice, language: string, text: string) => {
  const t = tuningKey(voice.tuning);
  return `${VOICE_MODEL}|${voice.voiceId}|${language}|${t ? `${t}|` : ""}${text}`;
};

/** How long an audio file plays, in seconds. */
async function durationOf(blob: Blob): Promise<number> {
  const ctx = new OfflineAudioContext(1, 1, 44100);
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer());
  return audio.duration;
}

/** The scenes that have a line, with the text a voice reads for each. */
function linesOf(plan: Plan, lexicon: readonly Pronunciation[] = []): { scene: number; text: string }[] {
  const language = plan.language ?? "en";
  return plan.scenes.flatMap((s, scene) => (s.narration?.trim() ? [{ scene, text: spoken(s.narration.trim(), language, lexicon) }] : []));
}

/**
 * Records every scene's line with the person's ElevenLabs key, reusing lines
 * already recorded with the same voice, and returns the plan with each
 * line's measured length (so each scene holds while it is spoken).
 */
export async function recordNarration(plan: Plan, apiKey: string, voice: VoiceChoice, opts: { signal?: AbortSignal; lexicon?: readonly Pronunciation[]; onLine?: (done: number, total: number) => void } = {}): Promise<Narration> {
  const language = plan.language ?? "en";
  const lines = linesOf(plan, opts.lexicon);
  const clips: Record<number, Blob> = {};
  const seconds: Record<number, number> = {};
  let done = 0;
  // Two at a time: quicker than one by one, within ElevenLabs' concurrency on every plan.
  const queue = [...lines];
  const worker = async () => {
    for (let line = queue.shift(); line; line = queue.shift()) {
      const key = lineKey(voice, language, line.text);
      let blob = await getLine(key);
      if (!blob) {
        blob = await speak(apiKey, voice.voiceId, line.text, language, opts.signal, voice.tuning);
        await putLine(key, blob);
      }
      clips[line.scene] = blob;
      seconds[line.scene] = Math.round((await durationOf(blob)) * 100) / 100;
      opts.onLine?.(++done, lines.length);
    }
  };
  await Promise.all([worker(), worker()]);
  return {
    plan: { ...plan, scenes: plan.scenes.map((s, i) => (seconds[i] ? { ...s, narration_seconds: seconds[i] } : s)) },
    clips,
  };
}

/** A project's recorded lines from this browser's store, or null when any is missing (cleared storage, another browser). */
export async function storedNarration(plan: Plan, voice: VoiceChoice, lexicon: readonly Pronunciation[] = []): Promise<Record<number, Blob> | null> {
  const language = plan.language ?? "en";
  const clips: Record<number, Blob> = {};
  for (const line of linesOf(plan, lexicon)) {
    const blob = await getLine(lineKey(voice, language, line.text));
    if (!blob) return null;
    clips[line.scene] = blob;
  }
  return clips;
}

/** Whether a plan has lines to record. */
export const hasNarration = (plan: Plan) => plan.scenes.some((s) => s.narration?.trim());
