import "server-only";
import type { CatalogModel } from "@/director/input";
import { SseAssembler, StreamError, type Assembled, type Progress } from "./sse";

/**
 * Everything this app asks of OneAPI: the director's chat completions, sent
 * with the person's own OneAPI key, and the public model catalog that gives
 * a brief naming a model its real prices.
 */

export const BASE_URL = (process.env.ONEAPI_BASE_URL ?? "https://api.oneapi.id/v1").replace(/\/+$/, "");
const CATALOG_URL = process.env.ONEAPI_CATALOG_URL ?? "https://oneapi.id/api/public/models";

/** OneAPI's own words when a call fails, for the person to read. */
export class OneAPIError extends Error {
  /** The stream broke after it started: asking again without streaming may get through. */
  midStream = false;
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OneAPIError";
  }
}

type Listing = {
  public_model: string;
  display_name?: string;
  tagline?: string;
  context_window?: string;
  capabilities?: string[] | null;
  price_input_per_1m?: string;
  price_output_per_1m?: string;
  list_price_input_per_1m?: string | null;
  list_price_output_per_1m?: string | null;
  currency?: string;
  free_enabled?: boolean;
};

let cache: { at: number; models: CatalogModel[] } | null = null;
const CATALOG_TTL = 10 * 60 * 1000;

/** The public catalog, cached for ten minutes. An outage costs only facts. */
export async function catalog(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.at < CATALOG_TTL) return cache.models;
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const body = (await res.json()) as { models?: Listing[] };
    const models = (body.models ?? []).map(
      (l): CatalogModel => ({
        id: l.public_model,
        name: l.display_name ?? "",
        tagline: l.tagline ?? "",
        contextWindow: l.context_window ?? "",
        capabilities: l.capabilities ?? [],
        inputPrice: l.price_input_per_1m ?? "",
        outputPrice: l.price_output_per_1m ?? "",
        listInput: l.list_price_input_per_1m ?? "",
        listOutput: l.list_price_output_per_1m ?? "",
        currency: l.currency ?? "USD",
        free: Boolean(l.free_enabled),
      }),
    );
    cache = { at: Date.now(), models };
    return models;
  } catch (err) {
    console.warn("OneAPI catalog unavailable:", err);
    return cache?.models ?? [];
  }
}

/** One non-streaming chat completion with the person's key. */
export async function chat(key: string, body: unknown, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "oneapi-motion/0.1" },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let parsed: { error?: { message?: string } } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!res.ok) throw failure(res.status, parsed?.error?.message);
  if (!parsed) throw new OneAPIError(502, "OneAPI sent an answer that was not JSON.");
  return parsed;
}

/** OneAPI's refusal in words a person can act on. */
function failure(status: number, said: string | undefined): OneAPIError {
  const message =
    status === 401
      ? "OneAPI did not accept this API key. Check it in Settings, or create one at oneapi.id."
      : status === 402
        ? "Your OneAPI balance is too low for this model. Top up at oneapi.id, or pick a cheaper model."
        : status === 429
          ? "OneAPI is rate limiting this key. Wait a moment and try again."
          : `OneAPI answered ${status}${said ? `: ${said}` : "."}`;
  return new OneAPIError(status, message);
}

/**
 * One chat completion, streamed from OneAPI and reassembled here into the
 * shape of a non-streamed one. The provider sends as it writes, so a long
 * reply (a big file, a model that thinks first) keeps its connection alive
 * instead of being cut off as an idle request.
 */
export async function chatStreamed(key: string, body: Record<string, unknown>, signal: AbortSignal, onProgress?: (p: Progress) => void): Promise<Assembled> {
  const send = (extra: Record<string, unknown>) =>
    fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "text/event-stream", "User-Agent": "oneapi-motion/0.1" },
      body: JSON.stringify({ ...body, stream: true, ...extra }),
      signal,
    });
  let res = await send({ stream_options: { include_usage: true } });
  if (res.status === 400) {
    // Some providers behind the gateway take no stream_options: ask again without (usage is then unknown).
    const said = await res.text();
    if (/stream_options/i.test(said)) res = await send({});
    else throw failure(400, errorOf(said));
  }
  if (!res.ok) throw failure(res.status, errorOf(await res.text()));
  // A gateway that ignored stream sends one JSON answer.
  if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) {
    const text = await res.text();
    try {
      return JSON.parse(text) as Assembled;
    } catch {
      throw new OneAPIError(502, "OneAPI sent an answer that was not JSON.");
    }
  }
  const sse = new SseAssembler();
  const reader = res.body?.getReader();
  if (!reader) throw new OneAPIError(502, "OneAPI sent an empty answer.");
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      sse.push(decoder.decode(value, { stream: true }));
      onProgress?.(sse.progress());
      if (sse.done) break;
    }
  } catch (err) {
    if (err instanceof StreamError) {
      const e = new OneAPIError(502, `OneAPI: ${err.message}`);
      e.midStream = true;
      throw e;
    }
    // The connection dropped mid-reply.
    if (err instanceof TypeError) {
      const e = new OneAPIError(502, "The connection to OneAPI dropped mid-reply.");
      e.midStream = true;
      throw e;
    }
    throw err;
  }
  return sse.result();
}

const errorOf = (text: string): string | undefined => {
  try {
    const e = (JSON.parse(text) as { error?: { message?: string } | string }).error;
    return typeof e === "string" ? e : e?.message;
  } catch {
    return text.slice(0, 200) || undefined;
  }
};

/**
 * A completion streamed when it can be: a stream that breaks after it
 * started is asked again once, without streaming, since some providers
 * behind the gateway stream unreliably.
 */
export async function chatResilient(key: string, body: Record<string, unknown>, signal: AbortSignal, onProgress?: (p: Progress & { note?: string }) => void): Promise<Assembled> {
  try {
    return await chatStreamed(key, body, signal, onProgress);
  } catch (err) {
    if (!(err instanceof OneAPIError && err.midStream) || signal.aborted) throw err;
    onProgress?.({ chars: 0, note: "the stream broke; asking again without streaming" });
    return (await chat(key, body, signal)) as Assembled;
  }
}

/** A web search's answer: ranked results as text, or the reason it found nothing. */
export type WebSearchResult = { text: string; failed: boolean };

/**
 * One web search through OneAPI's MCP server (POST /mcp, stateless JSON-RPC),
 * with the person's key: billed per search like an :online request's. It is
 * a tool call of its own, so a search that fails is a line for the model to
 * read, not a model step that fails.
 */
export async function webSearch(key: string, query: string, numResults: number, signal: AbortSignal): Promise<WebSearchResult> {
  const res = await fetch(`${BASE_URL}/mcp`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream", "User-Agent": "oneapi-motion/0.1" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "web_search", arguments: { query, num_results: numResults } } }),
    signal,
  });
  const text = await res.text();
  if (!res.ok) throw failure(res.status, errorOf(text));
  let reply: { result?: { content?: { type: string; text?: string }[]; isError?: boolean }; error?: { message?: string } };
  try {
    reply = JSON.parse(text);
  } catch {
    throw new OneAPIError(502, "OneAPI's web search sent an answer that was not JSON.");
  }
  if (reply.error) return { text: reply.error.message ?? "The search failed.", failed: true };
  const said = (reply.result?.content ?? []).map((c) => (c.type === "text" ? (c.text ?? "") : "")).join("\n").trim();
  return { text: said || "No results.", failed: Boolean(reply.result?.isError) };
}
