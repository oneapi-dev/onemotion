/**
 * ElevenLabs, called from the browser with the person's own key: it never
 * passes through this app's server. ElevenLabs allows these calls from any
 * origin (CORS), so nothing needs proxying.
 */

const API = "https://api.elevenlabs.io";
/** The voice model: reads Indonesian, English and some 70 other languages. */
export const VOICE_MODEL = "eleven_v4";

export type Voice = {
  id: string;
  name: string;
  /** "Male, middle aged, American, social media" and the like. */
  about: string;
  /** A short sample ElevenLabs hosts; playing it costs no credits. */
  previewUrl: string | null;
  /** premade (ElevenLabs' own), or the person's: cloned, generated, professional, a library voice they added. */
  category: string;
};

export class VoiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VoiceError";
  }
}

/** ElevenLabs' own message when it gives one, in words a person can act on. */
async function failure(res: Response): Promise<VoiceError> {
  const body = (await res.json().catch(() => null)) as { detail?: { message?: string; code?: string } | string } | null;
  const detail = typeof body?.detail === "string" ? body.detail : body?.detail?.message;
  if (res.status === 401) return new VoiceError("ElevenLabs did not accept the API key. Check it in Settings.");
  if (res.status === 402) return new VoiceError(detail ? `ElevenLabs: ${detail}` : "This needs a paid ElevenLabs plan.");
  if (res.status === 429) return new VoiceError("ElevenLabs is busy or your monthly credits are used up. Try again later.");
  return new VoiceError(detail ? `ElevenLabs: ${detail}` : `ElevenLabs answered ${res.status}.`);
}

type RawVoice = {
  voice_id: string;
  name?: string;
  category?: string;
  preview_url?: string | null;
  labels?: Record<string, string | undefined>;
};

/** The voices a key can speak with: ElevenLabs' own and the person's, theirs first. */
export async function listVoices(key: string, signal?: AbortSignal): Promise<Voice[]> {
  const res = await fetch(`${API}/v2/voices?page_size=100`, { headers: { "xi-api-key": key }, signal });
  if (!res.ok) throw await failure(res);
  const body = (await res.json()) as { voices?: RawVoice[] };
  const voices = (body.voices ?? []).map((v): Voice => {
    const l = v.labels ?? {};
    const about = [l.gender, l.age?.replace("_", " "), l.accent, (l.use_case ?? l["use case"])?.replaceAll("_", " ")].filter(Boolean).join(", ");
    return { id: v.voice_id, name: (v.name ?? "Voice").split(" - ")[0].trim(), about, previewUrl: v.preview_url ?? null, category: v.category ?? "premade" };
  });
  return voices.sort((a, b) => Number(a.category === "premade") - Number(b.category === "premade") || a.name.localeCompare(b.name));
}

/** One line read aloud, as MP3. `language` is an ISO 639-1 code; the voice speaks it natively when it can. */
export async function speak(key: string, voiceId: string, text: string, language: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`${API}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text, model_id: VOICE_MODEL, language_code: language }),
    signal,
  });
  if (!res.ok) throw await failure(res);
  return res.blob();
}
