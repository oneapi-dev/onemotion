import type { DirectInput } from "@/director/input";
import { matchModels } from "@/director/facts";
import { directRequest, parseAnswer, TruncatedAnswerError } from "@/director/prompt";
import { UnusablePlanError } from "@/director/rules";
import { catalog, chatStreamed, OneAPIError } from "@/server/oneapi";

// Reasoning models can think for a minute or two before they answer.
export const maxDuration = 300;

const MAX_BRIEF = 600;

/**
 * The director: the person's brief (and what was read from their website)
 * in, a checked plan out. The model call goes to OneAPI with the person's
 * own key, sent by the browser in X-OneAPI-Key and never stored.
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-oneapi-key")?.trim() ?? "";
  if (!key) return Response.json({ error: "Add your OneAPI API key in Settings first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as (DirectInput & { model?: string }) | null;
  if (!body || typeof body.prompt !== "string") return Response.json({ error: "Describe the video you want." }, { status: 400 });
  const prompt = body.prompt.trim();
  if ([...prompt].length > MAX_BRIEF) return Response.json({ error: `Keep the description under ${MAX_BRIEF} characters.` }, { status: 400 });
  if (!prompt && !body.site) return Response.json({ error: "Describe the video you want, or add a website." }, { status: 400 });
  const model = typeof body.model === "string" ? body.model.trim() : "";
  if (!model) return Response.json({ error: "Pick a model in Settings." }, { status: 400 });

  const models = await catalog();
  const input: DirectInput = {
    prompt,
    format: body.format === "portrait" || body.format === "square" ? body.format : "landscape",
    tone: body.tone ?? "auto",
    site: body.site ?? null,
    shots: [],
    models: matchModels(prompt, models, 4),
    knownModels: models.filter((m) => m.capabilities.includes("Chat")).slice(0, 4).map((m) => m.id),
    previous: body.previous,
    recent: Array.isArray(body.recent) ? body.recent.slice(0, 3) : [],
    variation: Math.floor(Math.random() * 10000),
    narration: body.narration === true,
  };

  const started = Date.now();
  try {
    const request = directRequest(model, input) as Record<string, unknown>;
    let answer: Awaited<ReturnType<typeof chatStreamed>>;
    try {
      answer = await chatStreamed(key, request, AbortSignal.timeout(170_000));
    } catch (err) {
      // A provider that timed out or fell over gets one more try while the request has time left.
      if (!(err instanceof OneAPIError && [429, 500, 502, 503, 504].includes(err.status)) || Date.now() - started > 100_000) throw err;
      await new Promise((r) => setTimeout(r, 3000));
      answer = await chatStreamed(key, request, AbortSignal.timeout(Math.max(30_000, 280_000 - (Date.now() - started))));
    }
    const plan = parseAnswer(answer as Parameters<typeof parseAnswer>[0], input);
    return Response.json({ plan, seconds: Math.round((Date.now() - started) / 1000) });
  } catch (err) {
    if (err instanceof OneAPIError) return Response.json({ error: err.message }, { status: err.status === 401 ? 401 : 502 });
    if (err instanceof TruncatedAnswerError) return Response.json({ error: err.message }, { status: 502 });
    if (err instanceof UnusablePlanError) return Response.json({ error: "The model's answer could not be used. Try again, or pick another model." }, { status: 502 });
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return Response.json({ error: "The model took too long to answer. Try again, or pick a faster model." }, { status: 504 });
    }
    console.error("direct failed", err);
    return Response.json({ error: "Something went wrong while designing. Try again." }, { status: 500 });
  }
}
