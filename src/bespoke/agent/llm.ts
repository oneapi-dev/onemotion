/** The OpenAI-style chat shapes the bespoke agent speaks, and one step through /api/chat. */

/** A prompt-cache breakpoint: the provider caches the prompt up to and including the part that carries it. */
export type CacheMark = { type: "ephemeral" };
export type Part = { type: "text"; text: string; cache_control?: CacheMark } | { type: "image_url"; image_url: { url: string }; cache_control?: CacheMark };
export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type Msg =
  | { role: "system"; content: string }
  | { role: "user"; content: string | Part[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolSpec = { type: "function"; function: { name: string; description: string; parameters: Record<string, unknown> } };
export type Usage = { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };

export class ChatError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ChatError";
  }
}

type Choice = { message?: { content?: string | Part[] | null; tool_calls?: ToolCall[]; reasoning_content?: string }; finish_reason?: string };

/**
 * One completion: the reply's text, its tool calls and the tokens it used.
 * No response_format: OneAPI cannot carry it to every provider (Anthropic
 * models answer 400), so JSON is asked for in the prompt and parsed
 * leniently (see jsonStep).
 */
/** How far a reply has come while it streams: characters so far, the tool call being written and its file. */
export type StepProgress = { chars: number; tool?: string; path?: string; note?: string };

type StepInput = {
  key: string;
  model: string;
  messages: Msg[];
  tools?: ToolSpec[];
  maxTokens?: number;
  /** Let the model search and read the web on this step (OneAPI web search, billed per search). */
  web?: boolean;
  signal?: AbortSignal;
  onRetry?: (message: string) => void;
  onProgress?: (p: StepProgress) => void;
  /** Set on the try that already went to the backup model: it does not go on to another. */
  onBackup?: boolean;
  /** Sent exactly as given: no check of how the route treats system messages (the checks themselves). */
  raw?: boolean;
};

let backup: string | null = null;

const sight = new Map<string, Promise<boolean>>();

/**
 * Whether a model actually receives the images sent to it on this
 * connection (a gateway can drop them for some providers): one tiny picture
 * of a number, asked back. Remembered per model for the session. Answers
 * true when it cannot tell (no canvas here, or the check itself failed).
 */
export function seesImages(key: string, model: string, signal?: AbortSignal): Promise<boolean> {
  const known = sight.get(model);
  if (known) return known;
  const check = (async () => {
    if (typeof OffscreenCanvas === "undefined") return true;
    const c = new OffscreenCanvas(240, 120);
    const ctx = c.getContext("2d");
    if (!ctx) return true;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, 240, 120);
    ctx.fillStyle = "#000000";
    ctx.font = "bold 72px sans-serif";
    ctx.fillText("4739", 30, 88);
    const blob = await c.convertToBlob({ type: "image/png" });
    const url = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
    try {
      // Room for a reasoning model to think before it answers: an empty answer means it never saw the picture.
      const r = await chatOnce({ key, model, maxTokens: 3000, messages: [{ role: "user", content: [{ type: "text", text: "What number is written in this image? Reply with the digits only." }, { type: "image_url", image_url: { url } }] }], signal });
      return /4\s*7\s*3\s*9/.test(r.text);
    } catch (err) {
      // A check that could not run (offline, a busy provider) says nothing about sight: assume the model sees.
      return !(err instanceof ChatError) || TRANSIENT.has(err.status);
    }
  })();
  sight.set(model, check);
  return check;
}

const systemCheck = new Map<string, Promise<boolean>>();

/**
 * Whether a model's route drops the system message (a gateway can, for some
 * providers: the model then never sees its instructions): a password in a
 * system message, asked back. Remembered per model for the session. Answers
 * false when it cannot tell, so a failed check changes nothing.
 */
export function dropsSystem(key: string, model: string, signal?: AbortSignal): Promise<boolean> {
  const known = systemCheck.get(model);
  if (known) return known;
  const check = (async () => {
    try {
      // Room for a reasoning model to think before it answers.
      const r = await chatOnce({ key, model, maxTokens: 2000, raw: true, signal, messages: [{ role: "system", content: "The password is TANGERINE-41. When asked for the password, reply with it." }, { role: "user", content: "What is the password? Reply with the password only." }] });
      return r.text.trim() !== "" && !/TANGERINE/i.test(r.text);
    } catch {
      return false;
    }
  })();
  systemCheck.set(model, check);
  return check;
}

/**
 * The conversation with its system message moved to the head of the first
 * user message, for a route that drops system messages: the instructions
 * still come first, and a breakpoint on them stays where it was.
 */
export function foldSystem(messages: WireMsg[]): WireMsg[] {
  const sys = messages.filter((m) => m.role === "system");
  if (!sys.length) return messages;
  const marked = sys.some((m) => Array.isArray(m.content) && m.content.some((p) => p.cache_control));
  const text = sys.map((m) => (typeof m.content === "string" ? m.content : (m.content as Part[]).map((p) => (p.type === "text" ? p.text : "")).join(""))).join("\n\n");
  const head: Part = { type: "text", text: `INSTRUCTIONS (your system prompt; follow them throughout):\n${text}\n\nEND OF INSTRUCTIONS.`, ...(marked ? { cache_control: MARK } : {}) };
  const rest = messages.filter((m) => m.role !== "system");
  const at = rest.findIndex((m) => m.role === "user");
  if (at < 0) return [{ role: "user", content: [head] }, ...rest];
  const user = rest[at] as Extract<Msg, { role: "user" }>;
  const parts: Part[] = typeof user.content === "string" ? [{ type: "text", text: user.content }] : user.content;
  return rest.map((m, i) => (i === at ? { role: "user", content: [head, ...parts] } : m));
}

/**
 * The model a step goes to when the chosen one keeps failing for a reason
 * that passes (its provider down, timing out or rate limited), set from
 * Settings like the endpoint. Null: no backup, the step fails.
 */
export const setBackupModel = (model: string | null) => {
  backup = model?.trim() || null;
};

/** Statuses worth trying again: a rate limit, a provider that timed out or fell over, a gateway hiccup. */
export const TRANSIENT = new Set([429, 500, 502, 503, 504]);
/**
 * Waits before each new attempt. A model that is busy or briefly down
 * (429, 5xx) gets about two minutes in all; a step that timed out (504)
 * already took minutes, so it gets two more tries, then the agent loop
 * asks for smaller replies.
 */
const BACKOFF_MS = [4_000, 10_000, 20_000, 40_000, 60_000];
const TIMEOUT_RETRIES = 2;

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

/** Tries a step with web search gets before it goes on without: a search that fails tends to fail again. */
const WEB_RETRIES = 1;

/**
 * A step, tried again after a pause when it fails for a reason that passes
 * (a busy or unavailable model, a timeout, a dropped connection). A step
 * with web search that keeps failing, or is refused, goes on without it:
 * the film matters more than the search.
 */
export async function chatStep(o: StepInput): Promise<Awaited<ReturnType<typeof chatOnce>>> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await chatOnce(o);
    } catch (err) {
      const status = err instanceof ChatError ? err.status : 0;
      const transient = TRANSIENT.has(status) || (err instanceof TypeError && !o.signal?.aborted);
      if (o.web && !o.signal?.aborted && status !== 401 && status !== 402 && (!transient || attempt >= WEB_RETRIES)) {
        o.onRetry?.(`${err instanceof Error ? err.message : String(err)} Going on without web search for this step.`);
        o.onProgress?.({ chars: 0, note: "web search failed; going on without it" });
        return chatStep({ ...o, web: false });
      }
      const limit = status === 504 ? TIMEOUT_RETRIES : BACKOFF_MS.length;
      // A provider that refuses part of the request it cannot do (only tool_choice "auto", say) will refuse it again: no retries, the backup at once.
      const unsupported = status === 400 && /not (currently )?supported|unsupported|tool_choice/i.test(err instanceof Error ? err.message : "");
      if (unsupported && backup && backup !== o.model && !o.onBackup && !o.signal?.aborted) {
        o.onRetry?.(`${o.model} refused this request (${err instanceof Error ? err.message : String(err)}). This step goes to the backup model, ${backup}.`);
        o.onProgress?.({ chars: 0, note: `${o.model} cannot do this request: this step goes to the backup model, ${backup}` });
        return chatStep({ ...o, model: backup, onBackup: true });
      }
      if (transient && attempt >= limit && backup && backup !== o.model && !o.onBackup && !o.signal?.aborted) {
        // Its provider keeps failing: this step goes to the backup model; the next step tries the chosen one again.
        o.onRetry?.(`${o.model} failed ${limit + 1} times (${err instanceof Error ? err.message : String(err)}). This step goes to the backup model, ${backup}.`);
        o.onProgress?.({ chars: 0, note: `${o.model} keeps failing: this step goes to the backup model, ${backup}` });
        return chatStep({ ...o, model: backup, onBackup: true });
      }
      if (!transient || attempt >= limit) throw err;
      const ms = BACKOFF_MS[attempt];
      o.onRetry?.(`${err instanceof Error ? err.message : String(err)} Trying again in ${ms / 1000} s (attempt ${attempt + 2} of ${limit + 1}).`);
      o.onProgress?.({ chars: 0, note: `waiting ${ms / 1000} s to try again (attempt ${attempt + 2} of ${limit + 1}): ${status === 503 ? "the model is busy or briefly unavailable" : status === 429 ? "rate limited" : status === 504 ? "the provider timed out" : "the provider had a hiccup"}` });
      await wait(ms, o.signal);
    }
  }
}

/** The person's own AI endpoint, when they use one instead of OneAPI: base URL, API style and how the key is sent. */
export type ClientEndpoint = { base: string; api: "chat" | "responses" | "messages"; auth: "bearer" | "x-api-key" };

let active: ClientEndpoint | null = null;

/**
 * Where the studio's AI calls go, set from Settings: OneAPI (null) or the
 * person's endpoint. It is app configuration like a base URL, so it rides
 * on every AI request as headers instead of through every function.
 */
export const setEndpoint = (e: ClientEndpoint | null) => {
  active = e;
};

/** The headers that send a request to the active endpoint with the person's key. */
export const aiHeaders = (key: string): Record<string, string> => ({
  "X-OneAPI-Key": key,
  ...(active ? { "X-Provider-Base": active.base, "X-Provider-Api": active.api, "X-Provider-Auth": active.auth } : {}),
});

/** A message as sent: a system or tool message may carry its text as parts, to hold a cache breakpoint. */
export type WireMsg = Msg | { role: "system"; content: Part[] } | { role: "tool"; tool_call_id: string; content: Part[] };

/** Breakpoints a request may carry (Anthropic's limit). */
const MAX_MARKS = 4;
const MARK: CacheMark = { type: "ephemeral" };
const marked = (m: WireMsg) => Array.isArray(m.content) && m.content.some((p) => p.cache_control);

/** The message with a breakpoint on its last text part (its last part when it has no text), or as it was when it cannot carry one. */
function mark(m: WireMsg): WireMsg {
  if (m.role === "assistant") return m;
  if (typeof m.content === "string") return { ...m, content: [{ type: "text", text: m.content, cache_control: MARK }] } as WireMsg;
  const parts = m.content as Part[];
  if (!parts.length) return m;
  const at = parts.map((p) => p.type).lastIndexOf("text");
  const i = at >= 0 ? at : parts.length - 1;
  return { ...m, content: parts.map((p, k) => (k === i ? { ...p, cache_control: MARK } : p)) } as WireMsg;
}

/**
 * The conversation with prompt-cache breakpoints, so a provider that caches
 * by breakpoint (Claude, Gemini) bills the unchanged prefix of every step at
 * the cached rate: the system prompt (with the tools before it), the end of
 * the previous step's prompt (which the last step wrote to the cache) and the
 * end of this one (written for the next step), then the task. Breakpoints the
 * caller set (a shared context) come first. At most four in all; providers
 * that cache on their own get them removed on the server.
 */
export function withCache(messages: Msg[]): WireMsg[] {
  const out: WireMsg[] = [...messages];
  let budget = MAX_MARKS - out.filter(marked).length;
  const lastAssistant = out.map((m) => m.role).lastIndexOf("assistant");
  const prevEnd = lastAssistant > 0 ? lastAssistant - 1 : -1;
  const firstUser = out.findIndex((m) => m.role === "user");
  const wanted = [out.findIndex((m) => m.role === "system"), out.length - 1, prevEnd, firstUser];
  for (const i of [...new Set(wanted)]) {
    if (budget <= 0) break;
    if (i < 0 || out[i].role === "assistant" || marked(out[i])) continue;
    out[i] = mark(out[i]);
    budget--;
  }
  return out;
}

async function chatOnce(o: StepInput) {
  const cached = withCache(o.messages);
  const messages = !o.raw && cached.some((m) => m.role === "system") && (await dropsSystem(o.key, o.model, o.signal)) ? foldSystem(cached) : cached;
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...aiHeaders(o.key) },
    body: JSON.stringify({
      model: o.model,
      messages,
      tools: o.tools,
      max_tokens: o.maxTokens ?? 32_000,
      web: o.web || undefined,
    }),
    signal: o.signal,
  });
  type Answer = { error?: string | { message?: string }; choices?: Choice[]; usage?: Usage };
  let body: Answer | null = null;
  if ((res.headers.get("content-type") ?? "").includes("ndjson") && res.body) {
    // Progress lines while the model writes, then the answer or the error.
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const line = (l: string) => {
      if (!l.trim()) return;
      const m = JSON.parse(l) as { type: string; answer?: Answer; status?: number; error?: string } & StepProgress;
      if (m.type === "progress") o.onProgress?.({ chars: m.chars, tool: m.tool, path: m.path, note: m.note });
      else if (m.type === "done") body = m.answer ?? null;
      else if (m.type === "error") throw new ChatError(m.status ?? 502, m.error ?? "The model step failed.");
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        line(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
      }
    }
    line(buffer);
    if (!body) throw new ChatError(502, "The step ended without an answer.");
  } else {
    body = (await res.json().catch(() => null)) as Answer | null;
    if (!res.ok || !body) {
      const said = typeof body?.error === "string" ? body.error : body?.error?.message;
      throw new ChatError(res.status, said ?? `The model step failed (${res.status}).`);
    }
  }
  const answer: Answer = body;
  const choice = answer.choices?.[0];
  const content = choice?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (p.type === "text" ? p.text : "")).join("") : "";
  return { text, toolCalls: choice?.message?.tool_calls ?? [], usage: answer.usage ?? {}, finish: choice?.finish_reason ?? "" };
}

/** A reply that should have been JSON and was not, with the text around the place the parser stopped. */
export class JsonReplyError extends Error {
  constructor(
    message: string,
    public near?: string,
  ) {
    super(message);
    this.name = "JsonReplyError";
  }
}

const nextVisible = (s: string, from: number) => {
  for (let i = from; i < s.length; i++) if (!/\s/.test(s[i])) return s[i];
  return undefined;
};

/**
 * Fixes the slips models make in long JSON: a double quote inside a string
 * left unescaped, a raw line break inside a string, a comma before a closing
 * bracket. A quote ends a string only when what follows it could follow a
 * string (, : } ] or the end); any other quote is part of the text.
 */
export function repairJson(raw: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inString) {
      if (c === "\\") {
        out += c + (raw[i + 1] ?? "");
        i++;
      } else if (c === '"') {
        const next = nextVisible(raw, i + 1);
        if (next === undefined || ",:}]".includes(next)) {
          inString = false;
          out += c;
        } else out += '\\"';
      } else if (c === "\n") out += "\\n";
      else if (c === "\r") out += "\\r";
      else if (c === "\t") out += "\\t";
      else out += c;
      continue;
    }
    if (c === '"') inString = true;
    if (c === ",") {
      const next = nextVisible(raw, i + 1);
      if (next === "}" || next === "]") continue;
    }
    out += c;
  }
  return out;
}

/** The JSON object in a model's reply, tolerating a fence or prose around it and the usual slips inside it. */
export function parseJson<T>(text: string): T {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1] : text;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new JsonReplyError("the answer had no JSON object in it");
  const json = raw.slice(start, end + 1);
  try {
    return JSON.parse(json) as T;
  } catch (err) {
    try {
      return JSON.parse(repairJson(json)) as T;
    } catch {
      const message = err instanceof Error ? err.message : String(err);
      const at = Number(/position (\d+)/.exec(message)?.[1]);
      throw new JsonReplyError(message, Number.isFinite(at) ? json.slice(Math.max(0, at - 80), at + 40) : undefined);
    }
  }
}

/** Usage of several calls added up. */
export const sumUsage = (p: Usage, q: Usage): Usage => ({
  prompt_tokens: (p.prompt_tokens ?? 0) + (q.prompt_tokens ?? 0),
  completion_tokens: (p.completion_tokens ?? 0) + (q.completion_tokens ?? 0),
  prompt_tokens_details: { cached_tokens: (p.prompt_tokens_details?.cached_tokens ?? 0) + (q.prompt_tokens_details?.cached_tokens ?? 0) },
});

/**
 * A model's JSON that parsed but does not fit what the app needs: thrown by
 * a validator with each problem named, so the model can be asked to fix
 * exactly those parts.
 */
export class SchemaError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join("; "));
    this.name = "SchemaError";
  }
}

/**
 * A completion whose answer must be one JSON object: parsed leniently, and
 * asked for once more when the first answer is not JSON, saying what was
 * wrong (or with twice the room when the answer was cut off). With
 * `validate`, a parsed answer that does not fit is sent back once with its
 * problems named, to fix those parts and keep the rest; a second miss is
 * the model's failure, said as such (never as a problem with the brief).
 * Usage covers every call.
 */
export async function jsonStep<T>(o: StepInput, validate?: (value: unknown) => T): Promise<{ value: T; usage: Usage }> {
  const messages = [...o.messages];
  let reply = await chatStep(o);
  let usage = reply.usage;
  let parsed: unknown;
  try {
    parsed = parseJson<unknown>(reply.text);
  } catch (err) {
    const cut = reply.finish === "length";
    const what = err instanceof JsonReplyError ? err.message : String(err);
    const near = err instanceof JsonReplyError && err.near ? ` The parser stopped here: «${err.near}».` : "";
    const ask = cut
      ? "Your answer was cut off before the JSON ended. Reply with the complete JSON object again, written more tightly (shorter strings, nothing extra): no prose, no markdown fence."
      : `That was not a valid JSON object (${what}).${near} Reply with the corrected JSON object only: no prose, no markdown fence. Write a double quote inside a string as \\".`;
    messages.push({ role: "assistant", content: reply.text || "(no answer)" }, { role: "user", content: ask });
    reply = await chatStep({ ...o, maxTokens: cut ? Math.min(32_000, (o.maxTokens ?? 16_000) * 2) : o.maxTokens, messages });
    usage = sumUsage(usage, reply.usage);
    try {
      parsed = parseJson<unknown>(reply.text);
    } catch (second) {
      const said = second instanceof Error ? second.message : String(second);
      throw new JsonReplyError(`The model answered with broken JSON twice (${said}${reply.finish === "length" ? ", cut off at the length limit" : ""}). Try again, or pick another model.`);
    }
  }
  if (!validate) return { value: parsed as T, usage };
  try {
    return { value: validate(parsed), usage };
  } catch (err) {
    if (!(err instanceof SchemaError) && !(err instanceof Error)) throw err;
    const problems = err instanceof SchemaError ? err.problems : [err.message];
    messages.push(
      { role: "assistant", content: reply.text },
      { role: "user", content: `That JSON does not fit what is needed:\n${problems.map((p) => `- ${p}`).join("\n")}\nFix exactly these parts and keep everything else as it was. Reply with the complete corrected JSON object only: no prose, no markdown fence.` },
    );
    const again = await chatStep({ ...o, messages });
    usage = sumUsage(usage, again.usage);
    try {
      return { value: validate(parseJson<unknown>(again.text)), usage };
    } catch (second) {
      const said = second instanceof Error ? second.message : String(second);
      throw new JsonReplyError(`The model's answer did not have the shape the studio needs, twice (${said}). This is the model's output, not a problem with your brief: try again, or pick another model.`);
    }
  }
}
