import { STEP_TIMEOUT_MS } from "@/server/budget";
import { OneAPIError } from "@/server/oneapi";
import { complete, endpointOf, type Endpoint } from "@/server/provider";

// One step of the bespoke agent: a reply may take minutes on a reasoning model
// (a 45-second film's concept is the longest single reply it asks for). A
// hosted deployment caps the request here at its own limit; raise it as far as
// the host allows, and keep STEP_TIMEOUT_MS below it.
export const maxDuration = 600;

/** A request body this large is a mistake (renders are scaled down before they are sent). */
const MAX_BODY = 12_000_000;

/**
 * Whether the step ran out of time: the step's own budget aborts with a
 * TimeoutError, and a socket timeout (undici's HeadersTimeoutError or
 * BodyTimeoutError) reaches the fetch caller as `TypeError: fetch failed`
 * with the real name in `cause`.
 */
function timedOut(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "TimeoutError" || err.name === "AbortError") return true;
  const cause = err.cause;
  return cause instanceof Error && cause.name.endsWith("TimeoutError");
}

/**
 * One chat completion for the bespoke agent, with the person's own key from
 * X-OneAPI-Key (never stored). The browser runs the agent's loop and keeps
 * its conversation; this only forwards one step, so no request comes near
 * a hosting limit.
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-oneapi-key")?.trim() ?? "";
  if (!key) return Response.json({ error: "Add your API key in Settings first." }, { status: 401 });
  let ep: Endpoint;
  try {
    ep = endpointOf(req);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Bad endpoint." }, { status: 400 });
  }
  const raw = await req.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "This step is too large to send." }, { status: 413 });
  let body: { model?: unknown; messages?: unknown; tools?: unknown; max_tokens?: unknown; web?: unknown };
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
  if (typeof body.max_tokens === "number") request.max_tokens = Math.max(256, Math.min(64_000, Math.round(body.max_tokens)));
  // OneAPI web search: the gateway gives the model web_search and web_fetch and runs them (billed per search).
  if (body.web === true && !ep.custom) request.plugins = [{ id: "web", max_results: 3 }];
  // The answer comes back as lines of JSON (NDJSON): progress while the model writes, then the answer or the error.
  // The person sees the step move, and the connection is never idle.
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      const send = (line: unknown) => ctrl.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      let last = 0;
      try {
        const answer = await complete(ep, key, request, AbortSignal.any([AbortSignal.timeout(STEP_TIMEOUT_MS), req.signal]), (p) => {
          const now = Date.now();
          if (now - last < 400 && !p.note) return;
          last = now;
          send({ type: "progress", ...p });
        });
        send({ type: "done", answer });
      } catch (err) {
        // The provider's status passes through, so the browser knows a timeout or a rate limit is worth retrying.
        if (err instanceof OneAPIError) send({ type: "error", status: [401, 402, 429, 500, 502, 503, 504].includes(err.status) ? err.status : 502, error: err.message });
        else if (timedOut(err)) {
          // The step's own budget, or the connection's own timeout.
          const why = err instanceof Error ? (err.cause instanceof Error ? err.cause.name : err.name) : "unknown";
          console.warn(`chat step gave up after ${Math.round(STEP_TIMEOUT_MS / 1000)}s on ${body.model} (${why})`);
          send({ type: "error", status: 504, error: "The model took too long on this step." });
        }
        else {
          console.error("chat step failed", err);
          send({ type: "error", status: 500, error: "The step failed. Try again." });
        }
      } finally {
        ctrl.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
