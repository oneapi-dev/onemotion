import { chat, OneAPIError } from "@/server/oneapi";

// One step of the bespoke agent: a reply may take a few minutes on a reasoning model.
export const maxDuration = 300;

/** A request body this large is a mistake (renders are scaled down before they are sent). */
const MAX_BODY = 12_000_000;
const STEP_TIMEOUT = 280_000;

/**
 * One chat completion for the bespoke agent, with the person's own key from
 * X-OneAPI-Key (never stored). The browser runs the agent's loop and keeps
 * its conversation; this only forwards one step, so no request comes near
 * a hosting limit.
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-oneapi-key")?.trim() ?? "";
  if (!key) return Response.json({ error: "Add your OneAPI API key in Settings first." }, { status: 401 });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "This step is too large to send." }, { status: 413 });
  let body: { model?: unknown; messages?: unknown; tools?: unknown; temperature?: unknown; max_tokens?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return Response.json({ error: "Send JSON." }, { status: 400 });
  }
  if (typeof body.model !== "string" || !body.model.trim() || !Array.isArray(body.messages) || !body.messages.length) {
    return Response.json({ error: "Send a model and messages." }, { status: 400 });
  }
  const request: Record<string, unknown> = { model: body.model.trim(), messages: body.messages };
  if (Array.isArray(body.tools) && body.tools.length) request.tools = body.tools;
  if (typeof body.temperature === "number") request.temperature = Math.max(0, Math.min(2, body.temperature));
  if (typeof body.max_tokens === "number") request.max_tokens = Math.max(256, Math.min(64_000, Math.round(body.max_tokens)));
  try {
    return Response.json(await chat(key, request, AbortSignal.timeout(STEP_TIMEOUT)));
  } catch (err) {
    if (err instanceof OneAPIError) return Response.json({ error: err.message }, { status: err.status === 401 ? 401 : err.status === 402 ? 402 : 502 });
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) {
      return Response.json({ error: "The model took too long on this step." }, { status: 504 });
    }
    console.error("chat step failed", err);
    return Response.json({ error: "The step failed. Try again." }, { status: 500 });
  }
}
