import { OneAPIError } from "@/server/oneapi";
import { detect } from "@/server/provider";

export const maxDuration = 60;

/**
 * Finds what a person's own AI endpoint is: from its base URL and their key
 * (never stored), the models it lists and the API it speaks (OpenAI Chat
 * Completions, OpenAI Responses or Anthropic Messages). Costs at most a few
 * tokens on their key.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { base?: unknown; key?: unknown } | null;
  const base = typeof body?.base === "string" ? body.base.trim() : "";
  const key = typeof body?.key === "string" ? body.key.trim() : "";
  if (!/^https?:\/\//i.test(base)) return Response.json({ error: "Enter the base URL, starting with https:// (for example https://openrouter.ai/api/v1)." }, { status: 400 });
  if (!key) return Response.json({ error: "Enter the endpoint's API key." }, { status: 400 });
  try {
    return Response.json(await detect(base, key, AbortSignal.any([AbortSignal.timeout(55_000), req.signal])));
  } catch (err) {
    if (err instanceof OneAPIError) return Response.json({ error: err.message }, { status: err.status === 401 ? 401 : 400 });
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return Response.json({ error: "The endpoint took too long to answer." }, { status: 504 });
    console.error("provider detect failed", err);
    return Response.json({ error: "The endpoint could not be checked." }, { status: 502 });
  }
}
