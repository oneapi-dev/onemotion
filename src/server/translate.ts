import type { Assembled } from "./sse";

/**
 * The studio speaks OpenAI Chat Completions (messages, tools, image parts,
 * usage). A person's own endpoint may instead speak OpenAI Responses or
 * Anthropic Messages: these translate a chat request into each and the
 * answer back, so the agent loop never knows the difference. Pure.
 */

export type ApiStyle = "chat" | "responses" | "messages";

/** A prompt-cache breakpoint on a part (see cache.ts). */
type Mark = { cache_control?: { type: "ephemeral" } };
type Part = ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }) & Mark;
type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
type ChatMessage =
  | { role: "system"; content: string | Part[] }
  | { role: "user"; content: string | Part[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string | Part[] };
type ChatTool = { type: "function"; function: { name: string; description?: string; parameters?: unknown } };
export type ChatRequest = { model: string; messages: ChatMessage[]; tools?: ChatTool[]; temperature?: number; max_tokens?: number };

const textOf = (c: string | Part[] | null | undefined): string => (typeof c === "string" ? c : (c ?? []).map((p) => (p.type === "text" ? p.text : "")).join("\n"));
const partsOf = (c: string | Part[] | null | undefined): Part[] => (typeof c === "string" ? (c ? [{ type: "text", text: c }] : []) : (c ?? []));

// ---------------------------------------------------------- OpenAI Responses

export function toResponses(r: ChatRequest): Record<string, unknown> {
  const instructions = r.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n\n");
  const input: unknown[] = [];
  for (const m of r.messages) {
    if (m.role === "system") continue;
    if (m.role === "user") input.push({ role: "user", content: partsOf(m.content).map((p) => (p.type === "text" ? { type: "input_text", text: p.text } : { type: "input_image", image_url: p.image_url.url })) });
    else if (m.role === "assistant") {
      if (m.content) input.push({ role: "assistant", content: [{ type: "output_text", text: m.content }] });
      for (const c of m.tool_calls ?? []) input.push({ type: "function_call", call_id: c.id, name: c.function.name, arguments: c.function.arguments });
    } else input.push({ type: "function_call_output", call_id: m.tool_call_id, output: textOf(m.content) });
  }
  return {
    model: r.model,
    input,
    ...(instructions ? { instructions } : {}),
    ...(r.tools?.length ? { tools: r.tools.map((t) => ({ type: "function", name: t.function.name, description: t.function.description ?? "", parameters: t.function.parameters ?? { type: "object", properties: {} } })) } : {}),
    ...(typeof r.temperature === "number" ? { temperature: r.temperature } : {}),
    ...(typeof r.max_tokens === "number" ? { max_output_tokens: Math.max(16, r.max_tokens) } : {}),
    store: false,
  };
}

type ResponsesAnswer = {
  status?: string;
  incomplete_details?: { reason?: string } | null;
  output?: ({ type: "message"; content?: { type: string; text?: string }[] } | { type: "function_call"; call_id: string; name: string; arguments: string } | { type: string })[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
};

export function fromResponses(a: ResponsesAnswer): Assembled {
  let content = "";
  const calls: ToolCall[] = [];
  for (const item of a.output ?? []) {
    if (item.type === "message") for (const c of (item as { content?: { type: string; text?: string }[] }).content ?? []) if (c.type === "output_text" && c.text) content += c.text;
    if (item.type === "function_call") {
      const f = item as { call_id: string; name: string; arguments: string };
      calls.push({ id: f.call_id, type: "function", function: { name: f.name, arguments: f.arguments || "{}" } });
    }
  }
  const finish = a.status === "incomplete" && a.incomplete_details?.reason === "max_output_tokens" ? "length" : calls.length ? "tool_calls" : "stop";
  return {
    choices: [{ message: { role: "assistant", content, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: finish }],
    usage: { prompt_tokens: a.usage?.input_tokens ?? 0, completion_tokens: a.usage?.output_tokens ?? 0, prompt_tokens_details: { cached_tokens: a.usage?.input_tokens_details?.cached_tokens ?? 0 } },
  };
}

// --------------------------------------------------------- Anthropic Messages

type Block = Record<string, unknown>;

function imageBlock(url: string): Block {
  const m = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  return m ? { type: "image", source: { type: "base64", media_type: m[1], data: m[2] } } : { type: "image", source: { type: "url", url } };
}

const parseArgs = (s: string): unknown => {
  try {
    return JSON.parse(s || "{}");
  } catch {
    return {};
  }
};

/** A block with the part's prompt-cache breakpoint, when it has one. */
const kept = (b: Block, p: Mark) => (p.cache_control ? { ...b, cache_control: p.cache_control } : b);

export function toMessages(r: ChatRequest): Record<string, unknown> {
  const systemText = r.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n\n");
  // A breakpoint on the system prompt caches the tools and the system prompt: Anthropic takes it on a system block.
  const systemMarked = r.messages.some((m) => m.role === "system" && Array.isArray(m.content) && m.content.some((p) => p.cache_control));
  const system = systemMarked ? [{ type: "text", text: systemText, cache_control: { type: "ephemeral" } }] : systemText;
  // Anthropic alternates user and assistant; tool results are user content. Neighbours of one role are joined.
  const turns: { role: "user" | "assistant"; content: Block[] }[] = [];
  const push = (role: "user" | "assistant", blocks: Block[]) => {
    if (!blocks.length) return;
    const last = turns[turns.length - 1];
    if (last?.role === role) last.content.push(...blocks);
    else turns.push({ role, content: blocks });
  };
  for (const m of r.messages) {
    if (m.role === "system") continue;
    if (m.role === "user") push("user", partsOf(m.content).map((p) => kept(p.type === "text" ? { type: "text", text: p.text } : imageBlock(p.image_url.url), p)));
    else if (m.role === "assistant") push("assistant", [...(m.content ? [{ type: "text", text: m.content }] : []), ...(m.tool_calls ?? []).map((c) => ({ type: "tool_use", id: c.id, name: c.function.name, input: parseArgs(c.function.arguments) }))]);
    else push("user", [kept({ type: "tool_result", tool_use_id: m.tool_call_id, content: textOf(m.content) || "(empty)" }, { cache_control: partsOf(m.content).find((p) => p.cache_control)?.cache_control })]);
  }
  if (turns[0]?.role === "assistant") turns.unshift({ role: "user", content: [{ type: "text", text: "(continue)" }] });
  return {
    model: r.model,
    max_tokens: r.max_tokens ?? 8192,
    messages: turns,
    ...(systemText ? { system } : {}),
    ...(r.tools?.length ? { tools: r.tools.map((t) => ({ name: t.function.name, description: t.function.description ?? "", input_schema: t.function.parameters ?? { type: "object", properties: {} } })) } : {}),
    ...(typeof r.temperature === "number" ? { temperature: Math.min(1, r.temperature) } : {}),
  };
}

type MessagesAnswer = {
  content?: ({ type: "text"; text: string } | { type: "tool_use"; id: string; name: string; input: unknown } | { type: string })[];
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
};

export function fromMessages(a: MessagesAnswer): Assembled {
  let content = "";
  const calls: ToolCall[] = [];
  for (const b of a.content ?? []) {
    if (b.type === "text") content += (b as { text: string }).text;
    if (b.type === "tool_use") {
      const t = b as { id: string; name: string; input: unknown };
      calls.push({ id: t.id, type: "function", function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) } });
    }
  }
  const finish = a.stop_reason === "max_tokens" ? "length" : calls.length ? "tool_calls" : "stop";
  return {
    choices: [{ message: { role: "assistant", content, ...(calls.length ? { tool_calls: calls } : {}) }, finish_reason: finish }],
    // Anthropic's input_tokens leaves out what was read from and written to the cache: the prompt is all three.
    usage: { prompt_tokens: (a.usage?.input_tokens ?? 0) + (a.usage?.cache_read_input_tokens ?? 0) + (a.usage?.cache_creation_input_tokens ?? 0), completion_tokens: a.usage?.output_tokens ?? 0, prompt_tokens_details: { cached_tokens: a.usage?.cache_read_input_tokens ?? 0 } },
  };
}

// -------------------------------------------------------------- model lists

/** Model ids from an OpenAI-style ({ data: [{ id }] }) or Anthropic-style list, or a bare array. */
export function modelIds(body: unknown): string[] {
  const list = Array.isArray(body) ? body : ((body as { data?: unknown[]; models?: unknown[] })?.data ?? (body as { models?: unknown[] })?.models ?? []);
  const ids = list.map((m) => (typeof m === "string" ? m : ((m as { id?: string; name?: string; model?: string })?.id ?? (m as { model?: string }).model ?? (m as { name?: string }).name ?? ""))).filter((x): x is string => typeof x === "string" && x.length > 0);
  return [...new Set(ids)].slice(0, 1000);
}

/** Models that cannot chat (embeddings, speech, images, moderation): never picked to probe or offered first. */
export const notChat = (id: string) => /(embed|whisper|tts|dall-?e|moderation|rerank|transcri|audio|image-gen|imagen|text-search|davinci-00|babbage)/i.test(id);
