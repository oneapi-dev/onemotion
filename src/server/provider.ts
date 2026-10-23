import "server-only";
import { Agent, fetch as pinnedFetch } from "undici";
import { breakpointsFor, refusedBreakpoints, usesBreakpoints, withoutBreakpoints } from "./cache";
import { BASE_URL, chatResilient, OneAPIError } from "./oneapi";
import { SiteError, vet } from "./site";
import { SseAssembler, StreamError, type Assembled, type Progress } from "./sse";
import { fromMessages, fromResponses, modelIds, notChat, toMessages, toResponses, type ApiStyle, type ChatRequest } from "./translate";

/**
 * Where the studio's AI calls go: OneAPI by default, or the person's own
 * endpoint (bring your own key). A custom endpoint is a base URL the person
 * typed, so the server treats it like any stranger's address: http(s) only,
 * every resolved address public (on the desktop app a local model server is
 * allowed too), the connection pinned to the address that was checked, no
 * redirects followed.
 */

export type Auth = "bearer" | "x-api-key";
export type Endpoint = { name: string; base: string; api: ApiStyle; auth: Auth; custom: boolean };

export const ONEAPI: Endpoint = { name: "OneAPI", base: BASE_URL, api: "chat", auth: "bearer", custom: false };

const desktop = () => Boolean(process.env.ONEMOTION_DESKTOP_SECRET);
const STYLES: ApiStyle[] = ["chat", "responses", "messages"];

/** The endpoint a request asks for (headers X-Provider-Base, -Api, -Auth); OneAPI without them. */
export function endpointOf(req: Request): Endpoint {
  const base = req.headers.get("x-provider-base")?.trim();
  if (!base) return ONEAPI;
  const api = req.headers.get("x-provider-api") as ApiStyle;
  const auth = req.headers.get("x-provider-auth") === "x-api-key" ? "x-api-key" : "bearer";
  let host = "your endpoint";
  try {
    host = new URL(base).host;
  } catch {
    throw new OneAPIError(400, "The endpoint's base URL is not a valid address.");
  }
  return { name: host, base: base.replace(/\/+$/, ""), api: STYLES.includes(api) ? api : "chat", auth, custom: true };
}

function headersFor(ep: Endpoint, key: string, extra: Record<string, string> = {}): Record<string, string> {
  const auth: Record<string, string> = ep.auth === "x-api-key" ? { "x-api-key": key } : { Authorization: `Bearer ${key}` };
  return { ...auth, ...(ep.api === "messages" || ep.auth === "x-api-key" ? { "anthropic-version": "2023-06-01" } : {}), "User-Agent": "onemotion/0.2", ...extra };
}

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

/** A firewall's block page (Cloudflare and the like) rather than the API's own JSON answer. */
const blockedPage = (res: Response | Awaited<ReturnType<typeof pinnedFetch>>) =>
  (res.status === 403 || res.status === 429 || res.status === 503) && (res.headers.get("cf-mitigated") !== null || (res.headers.get("content-type") ?? "").includes("text/html"));

/**
 * One request to a custom endpoint, over a connection pinned to its vetted
 * address. A firewall that blocks the studio's own User-Agent gets the same
 * request once more as a browser's.
 */
async function send(ep: Endpoint, key: string, path: string, init: { method: "GET" | "POST"; body?: unknown; accept?: string; signal: AbortSignal }) {
  const url = new URL(ep.base + path);
  let addr: { address: string; family: number };
  try {
    addr = await vet(url, { api: true, allowPrivate: desktop() });
  } catch (err) {
    throw new OneAPIError(400, err instanceof SiteError ? `${ep.name}: ${err.message}` : `${ep.name} could not be reached.`);
  }
  const dispatcher = new Agent({ connect: { lookup: (_h, _o, cb) => cb(null, [{ address: addr.address, family: addr.family }] as never) }, headersTimeout: 300_000, bodyTimeout: 300_000 });
  const once = (ua?: string) =>
    pinnedFetch(url, {
      method: init.method,
      headers: headersFor(ep, key, { Accept: init.accept ?? "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(ua ? { "User-Agent": ua } : {}) }),
      body: init.body ? JSON.stringify(init.body) : undefined,
      redirect: "manual",
      signal: init.signal,
      dispatcher,
    });
  try {
    let res = await once();
    if (blockedPage(res)) {
      await res.body?.cancel();
      res = await once(BROWSER_UA);
    }
    return { res, close: () => dispatcher.close() };
  } catch (err) {
    void dispatcher.close();
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) throw err;
    throw new OneAPIError(502, `${ep.name} could not be reached (${err instanceof Error ? err.message : String(err)}).`);
  }
}

const errorText = (text: string): string | undefined => {
  try {
    const e = (JSON.parse(text) as { error?: { message?: string } | string; message?: string }).error;
    return typeof e === "string" ? e : (e?.message ?? (JSON.parse(text) as { message?: string }).message);
  } catch {
    return text.slice(0, 200) || undefined;
  }
};

function failure(ep: Endpoint, status: number, text: string): OneAPIError {
  const said = errorText(text);
  if (status === 401 || status === 403) return new OneAPIError(401, `${ep.name} did not accept this API key${said ? ` (${said})` : ""}. Check it in Settings.`);
  if (status === 402) return new OneAPIError(402, `${ep.name}: the account's balance or plan does not cover this${said ? ` (${said})` : ""}.`);
  if (status === 429) return new OneAPIError(429, `${ep.name} is rate limiting this key. Wait a moment and try again.`);
  if (status >= 300 && status < 400) return new OneAPIError(502, `${ep.name} answered with a redirect; use the final base URL in Settings.`);
  return new OneAPIError(status, `${ep.name} answered ${status}${said ? `: ${said}` : "."}`);
}

/** A chat-completions endpoint, streamed and reassembled (as OneAPI's is), so a long reply never idles out. */
async function chatStream(ep: Endpoint, key: string, body: Record<string, unknown>, signal: AbortSignal, onProgress?: (p: Progress) => void): Promise<Assembled> {
  const { res, close } = await send(ep, key, "/chat/completions", { method: "POST", body: { ...body, stream: true }, accept: "text/event-stream", signal });
  try {
    if (!res.ok) throw failure(ep, res.status, await res.text());
    if (!(res.headers.get("content-type") ?? "").includes("text/event-stream")) return JSON.parse(await res.text()) as Assembled;
    const sse = new SseAssembler();
    const decoder = new TextDecoder();
    const reader = res.body?.getReader();
    if (!reader) throw new OneAPIError(502, `${ep.name} sent an empty answer.`);
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      sse.push(decoder.decode(value, { stream: true }));
      onProgress?.(sse.progress());
      if (sse.done) break;
    }
    return sse.result();
  } catch (err) {
    if (err instanceof StreamError) throw new OneAPIError(502, `${ep.name}: ${err.message}`);
    if (err instanceof TypeError && !signal.aborted) throw dropped(ep, err);
    throw err;
  } finally {
    void close();
  }
}

/** The connection broke while the reply was coming ("terminated", ECONNRESET): the network or the gateway, worth asking again. */
function dropped(ep: Endpoint, err: TypeError): OneAPIError {
  const code = (err.cause as { code?: string } | undefined)?.code;
  return new OneAPIError(502, `The connection to ${ep.name} dropped while the model was answering${code ? ` (${code})` : ""}. This is the network or the gateway, not the request.`);
}

/** A Responses or Messages endpoint: one answer, translated back to the chat shape. */
async function translated(ep: Endpoint, key: string, body: ChatRequest, signal: AbortSignal, onProgress?: (p: Progress & { note?: string }) => void): Promise<Assembled> {
  onProgress?.({ chars: 0, note: `waiting for ${ep.name}` });
  const path = ep.api === "responses" ? "/responses" : "/messages";
  const { res, close } = await send(ep, key, path, { method: "POST", body: ep.api === "responses" ? toResponses(body) : toMessages(body), signal });
  try {
    const text = await res.text().catch((err) => {
      throw err instanceof TypeError && !signal.aborted ? dropped(ep, err) : err;
    });
    if (!res.ok) throw failure(ep, res.status, text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new OneAPIError(502, `${ep.name} sent an answer that was not JSON.`);
    }
    return ep.api === "responses" ? fromResponses(parsed as Parameters<typeof fromResponses>[0]) : fromMessages(parsed as Parameters<typeof fromMessages>[0]);
  } finally {
    void close();
  }
}

/**
 * One completion on the endpoint the request asked for, in the chat shape.
 * Its prompt-cache breakpoints are fitted to the target (cache.ts); a
 * provider that refuses them gets the request once more without.
 */
export async function complete(ep: Endpoint, key: string, body: Record<string, unknown>, signal: AbortSignal, onProgress?: (p: Progress & { note?: string }) => void): Promise<Assembled> {
  const send = (b: Record<string, unknown>) => (!ep.custom ? chatResilient(key, b, signal, onProgress) : ep.api === "chat" ? chatStream(ep, key, b, signal, onProgress) : translated(ep, key, b as unknown as ChatRequest, signal, onProgress));
  const model = String(body.model ?? "");
  const messages = Array.isArray(body.messages) ? body.messages : [];
  try {
    return await send({ ...body, messages: breakpointsFor(messages, model, ep.api) });
  } catch (err) {
    if (!(usesBreakpoints(model, ep.api) && err instanceof OneAPIError && refusedBreakpoints(err.status, err.message)) || signal.aborted) throw err;
    onProgress?.({ chars: 0, note: "the provider refused the prompt-cache marks; asking again without them" });
    return send({ ...body, messages: withoutBreakpoints(messages) });
  }
}

const PATH: Record<ApiStyle, string> = { chat: "/chat/completions", responses: "/responses", messages: "/messages" };

const timedOut = (err: unknown, outer: AbortSignal) => !outer.aborted && err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");

/** The models an endpoint lists, with whichever key header it accepts. */
async function listModels(ep: Endpoint, key: string, signal: AbortSignal, ms: number): Promise<{ ids: string[]; auth: Auth } | null> {
  // The key is wrong only when both ways of sending it are refused; a 404 on one means the path is wrong.
  let refused = 0;
  for (const auth of ["bearer", "x-api-key"] as Auth[]) {
    try {
      const { res, close } = await send({ ...ep, auth }, key, "/models", { method: "GET", signal: AbortSignal.any([signal, AbortSignal.timeout(ms)]) });
      try {
        if (res.status === 401 || res.status === 403) {
          if (++refused === 2) throw failure(ep, res.status, await res.text());
          continue;
        }
        if (!res.ok) continue;
        const ids = modelIds(await res.json().catch(() => null));
        if (ids.length) return { ids, auth };
      } finally {
        void close();
      }
    } catch (err) {
      if (timedOut(err, signal)) throw new OneAPIError(504, `${ep.name}: GET ${ep.base}/models took over ${ms / 1000}s to answer.`);
      throw err;
    }
  }
  return null;
}

/**
 * One tiny request on an API path. `here` says whether the API exists at this
 * path; `error` says what went wrong, when anything did (a model that failed
 * on an API that is there still counts as there).
 */
async function probeApi(ep: Endpoint, key: string, model: string, signal: AbortSignal, ms: number): Promise<{ here: boolean; error?: string }> {
  const tiny: ChatRequest = { model, messages: [{ role: "user", content: "Say ok." }], max_tokens: 16 };
  const body = ep.api === "chat" ? tiny : ep.api === "responses" ? toResponses(tiny) : toMessages(tiny);
  try {
    const { res, close } = await send(ep, key, PATH[ep.api], { method: "POST", body, signal: AbortSignal.any([signal, AbortSignal.timeout(ms)]) });
    try {
      const text = await res.text();
      if (res.ok) return { here: true };
      const said = errorText(text);
      const error = `answered ${res.status}${said ? `: ${said}` : ""}`;
      // A 404 or 405 (or a 400 saying the route is unknown) means the API is not here, and a refused key means this style's
      // key header is not how this endpoint takes it; any other error came from the model behind it.
      if ([401, 403, 404, 405].includes(res.status)) return { here: false, error };
      if ((res.status === 400 || res.status === 422) && /not found|unknown (url|route|endpoint)|no route/i.test(text)) return { here: false, error };
      return { here: true, error };
    } finally {
      void close();
    }
  } catch (err) {
    // A path that is not there answers 404 at once; one that keeps the request open is there, with a slow model behind it.
    if (timedOut(err, signal)) return { here: true, error: `took over ${ms / 1000}s to answer (a slow or thinking model)` };
    if (err instanceof OneAPIError) return { here: false, error: err.message };
    throw err;
  }
}

export type Detected = { base: string; api: ApiStyle; auth: Auth; models: string[]; warning?: string };

/**
 * From a base URL and a key: the models it lists and the API it speaks.
 * A base without a version tries "/v1" too. The API is found with one tiny
 * request per style (chat completions first, then Responses, then
 * Anthropic Messages) to the cheapest-looking chat model, each given `ms`.
 * Once the model list is read it is always returned: when no test request
 * answers, Chat Completions is assumed and `warning` says what each one did.
 */
export async function detect(raw: string, key: string, signal: AbortSignal, ms = 15_000): Promise<Detected> {
  const clean = raw.trim().replace(/\/+$/, "");
  const bases = /\/v\d+[a-z]*$/i.test(clean) ? [clean] : [clean, `${clean}/v1`];
  let found: { base: string; ids: string[]; auth: Auth } | null = null;
  for (const base of bases) {
    const ep: Endpoint = { name: new URL(base).host, base, api: "chat", auth: "bearer", custom: true };
    const list = await listModels(ep, key, signal, ms);
    if (list) {
      found = { base, ...list };
      break;
    }
  }
  if (!found) throw new OneAPIError(404, `No model list at ${bases.map((b) => `${b}/models`).join(" or ")}. Check the base URL (it usually ends in /v1).`);
  const host = new URL(found.base).host;
  const chat = found.ids.filter((id) => !notChat(id));
  const models = [...chat, ...found.ids.filter(notChat)];
  const probe = chat.find((id) => /(mini|haiku|flash|lite|nano|small)/i.test(id)) ?? chat[0] ?? found.ids[0];
  const listed = `${host} listed ${found.ids.length} model${found.ids.length === 1 ? "" : "s"}`;
  const tried: string[] = [];
  for (const api of STYLES) {
    const ep: Endpoint = { name: host, base: found.base, api, auth: api === "messages" ? "x-api-key" : found.auth, custom: true };
    const r = await probeApi(ep, key, probe, signal, ms);
    if (r.here) {
      const warning = r.error ? `${listed} and speaks ${PATH[api]}, but the test request to ${probe} ${r.error}. The model list is loaded: pick the model you want below.` : undefined;
      return { base: found.base, api, auth: ep.auth, models, ...(warning ? { warning } : {}) };
    }
    tried.push(`${PATH[api]} ${r.error}`);
  }
  return {
    base: found.base,
    api: "chat",
    auth: found.auth,
    models,
    warning: `${listed}, but the test request to ${probe} failed: ${tried.join("; ")}. Chat Completions is set; if your endpoint speaks another API, choose it by hand.`,
  };
}
