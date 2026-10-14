import { OneAPIError, webSearch } from "@/server/oneapi";

export const maxDuration = 60;

const MAX_QUERY = 400;

/**
 * One web search for a bespoke agent, through OneAPI's MCP server with the
 * person's own key from X-OneAPI-Key (never stored). The agent calls it as a
 * tool, so a failed search does not fail the model step around it.
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-oneapi-key")?.trim() ?? "";
  if (!key) return Response.json({ error: "Add your OneAPI API key in Settings first." }, { status: 401 });
  const body = (await req.json().catch(() => null)) as { query?: unknown; num_results?: unknown } | null;
  const query = typeof body?.query === "string" ? body.query.trim() : "";
  if (!query) return Response.json({ error: "Send a query." }, { status: 400 });
  if (query.length > MAX_QUERY) return Response.json({ error: `Keep the query under ${MAX_QUERY} characters.` }, { status: 400 });
  const n = typeof body?.num_results === "number" ? Math.max(1, Math.min(10, Math.round(body.num_results))) : 5;
  try {
    return Response.json(await webSearch(key, query, n, AbortSignal.any([AbortSignal.timeout(50_000), req.signal])));
  } catch (err) {
    if (err instanceof OneAPIError) return Response.json({ error: err.message }, { status: err.status === 401 || err.status === 402 ? err.status : 502 });
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return Response.json({ error: "The search took too long." }, { status: 504 });
    console.error("web search failed", err);
    return Response.json({ error: "The search failed." }, { status: 502 });
  }
}
