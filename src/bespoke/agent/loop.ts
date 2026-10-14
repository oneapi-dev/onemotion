"use client";

import { ChatError, chatStep, type Msg, type Part, type StepProgress, type ToolSpec, type Usage } from "./llm";
import type { AgentTool, ToolResult } from "./tools";

/**
 * A small Claude-Code-style agent loop in the browser: the model works step
 * by step with tools (write files, check, render frames and look at them,
 * edit) until it calls `finish`. The conversation is the caller's; it is
 * handed back after every step so it can be saved and a run resumed.
 * Adapted from remotion-opus-skill's agent loop (MIT, (c) 2026 direkturcrypto).
 */

export type AgentEvent = { kind: "say" | "tool" | "error"; text: string };
export type Spend = { input: number; output: number; cached: number; usd: number };
export type Price = { input: number; output: number } | null;

/** Renders kept in the conversation: older ones are replaced, so the context does not balloon with pictures. */
const KEEP_IMAGE_MESSAGES = 2;
const NUDGES = 2;
/** Steps that may time out at the provider (after their retries) before a run gives up. */
const MAX_TIMEOUTS = 2;

function pruneImages(messages: Msg[]) {
  // The task (the first user message) keeps its reference screenshots; only renders are pruned.
  const task = messages.findIndex((m) => m.role === "user");
  const withImages = messages.flatMap((m, i) => (i !== task && m.role === "user" && Array.isArray(m.content) && m.content.some((p) => p.type === "image_url") ? [i] : []));
  for (const i of withImages.slice(0, -KEEP_IMAGE_MESSAGES)) {
    const m = messages[i] as Extract<Msg, { role: "user" }>;
    m.content = (m.content as Part[]).map((p) => (p.type === "image_url" ? { type: "text", text: "[an earlier render, removed to save context; render again if you need it]" } : p));
  }
}

const short = (s: string, n = 160) => (s.length > n ? `${s.slice(0, n)}…` : s).replace(/\n/g, " ");

const kchars = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));

/** What a streaming reply is doing, in words: "writing scene/index.tsx (4.1k characters)". */
export function describeProgress(p: StepProgress): string {
  if (p.note) return p.note;
  const size = p.chars ? ` (${kchars(p.chars)} characters)` : "";
  if (p.tool === "write_file") return `writing ${p.path ?? "a file"}${size}`;
  if (p.tool === "edit_file") return `editing ${p.path ?? "a file"}${size}`;
  if (p.tool) return `calling ${p.tool}${size}`;
  return p.chars ? `writing its reply${size}` : "thinking";
}

/** What a tool call is doing while it runs. */
const TOOL_ACTIVITY: Record<string, string> = {
  check: "checking the code (TypeScript and scene rules)",
  render_frames: "rendering frames to look at",
  contact_sheet: "rendering a contact sheet to look at",
  write_file: "saving a file",
  edit_file: "editing a file",
};

export function addUsage(s: Spend, u: Usage, price: Price): Spend {
  const input = u.prompt_tokens ?? 0;
  const output = u.completion_tokens ?? 0;
  const cached = u.prompt_tokens_details?.cached_tokens ?? 0;
  const usd = price ? (input * price.input + output * price.output) / 1e6 : 0;
  return { input: s.input + input, output: s.output + output, cached: s.cached + cached, usd: s.usd + usd };
}

export async function runAgent(o: {
  key: string;
  model: string;
  messages: Msg[];
  tools: AgentTool[];
  maxSteps: number;
  budgetUsd: number;
  price: Price;
  spend: Spend;
  onEvent: (e: AgentEvent) => void;
  onStep: (messages: Msg[], spend: Spend) => void;
  /** What is happening right now, for the person to see. */
  onActivity?: (text: string) => void;
  /** Spend shared by agents working in parallel: every step adds to it, and the budget is checked against it. */
  ledger?: Spend;
  /** Let this agent search and read the web (OneAPI web search). */
  web?: boolean;
  signal?: AbortSignal;
}): Promise<{ done: boolean; summary: string; spend: Spend }> {
  const { messages } = o;
  let spend = o.spend;
  const specs: ToolSpec[] = o.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description, parameters: t.parameters } }));
  let nudges = 0;
  let timeouts = 0;
  for (let step = 1; step <= o.maxSteps; step++) {
    if (o.signal?.aborted) return { done: false, summary: "stopped", spend };
    if (o.price && (o.ledger ?? spend).usd >= o.budgetUsd) {
      o.onEvent({ kind: "error", text: `Budget of $${o.budgetUsd.toFixed(2)} reached; stopping here.` });
      return { done: false, summary: "budget reached", spend };
    }
    pruneImages(messages);
    let reply: Awaited<ReturnType<typeof chatStep>>;
    try {
      const at = `step ${step} of ${o.maxSteps}`;
      o.onActivity?.(`${at}: the model is thinking`);
      reply = await chatStep({
        key: o.key,
        model: o.model,
        messages,
        tools: specs,
        temperature: 0.6,
        web: o.web,
        signal: o.signal,
        onRetry: (m) => o.onEvent({ kind: "error", text: m }),
        onProgress: (p) => o.onActivity?.(`${at}: the model is ${describeProgress(p)}`),
      });
    } catch (err) {
      // Still timing out after the retries: most often one reply grew too long. Ask for smaller ones and go on.
      if (!(err instanceof ChatError && err.status === 504) || ++timeouts > MAX_TIMEOUTS) throw err;
      o.onEvent({ kind: "error", text: `The provider timed out on this step (${timeouts}/${MAX_TIMEOUTS}); asking for smaller replies.` });
      messages.push({ role: "user", content: "Your last reply timed out at the provider before it arrived; nothing from it was received. Work in smaller replies: one file per reply, and keep each file focused." });
      o.onStep(messages, spend);
      continue;
    }
    const { text, toolCalls, usage, finish } = reply;
    spend = addUsage(spend, usage, o.price);
    if (o.ledger) Object.assign(o.ledger, addUsage(o.ledger, usage, o.price));
    // An assistant turn with neither text nor tool calls is refused by some providers behind the gateway.
    messages.push({ role: "assistant", content: text || (toolCalls.length ? null : "(no reply)"), ...(toolCalls.length ? { tool_calls: toolCalls } : {}) });
    if (text.trim()) o.onEvent({ kind: "say", text: text.trim() });
    if (finish === "length" && !toolCalls.length) {
      messages.push({ role: "user", content: "Your reply was cut off at the length limit. Work in smaller replies: at most 3 files per reply." });
      o.onStep(messages, spend);
      continue;
    }
    if (!toolCalls.length) {
      if (++nudges > NUDGES) break;
      messages.push({ role: "user", content: "Keep going with the tools. When the film is done and you have looked at rendered frames of it, call `finish`." });
      o.onStep(messages, spend);
      continue;
    }
    const images: Part[] = [];
    let done: string | null = null;
    for (const c of toolCalls) {
      const tool = o.tools.find((t) => t.name === c.function.name);
      let res: ToolResult;
      let args: Record<string, unknown> | null = null;
      try {
        args = c.function.arguments ? (JSON.parse(c.function.arguments) as Record<string, unknown>) : {};
      } catch {
        // A reply cut off mid tool call: keep the history valid for the next step.
        c.function.arguments = "{}";
      }
      o.onActivity?.(`step ${step} of ${o.maxSteps}: ${TOOL_ACTIVITY[c.function.name] ?? `running ${c.function.name}`}`);
      try {
        res = args === null ? { text: "This tool call was cut off before it finished; nothing was done. Send smaller replies: at most 3 files per reply." } : tool ? await tool.run(args) : { text: `unknown tool "${c.function.name}"` };
      } catch (err) {
        if (o.signal?.aborted) throw err;
        res = { text: `tool error: ${err instanceof Error ? err.message : String(err)}` };
      }
      o.onEvent({ kind: "tool", text: `${c.function.name}: ${short(res.text, 200)}` });
      messages.push({ role: "tool", tool_call_id: c.id, content: res.text });
      for (const img of res.images ?? []) images.push({ type: "text", text: img.label }, { type: "image_url", image_url: { url: img.url } });
      if (res.done) done = res.text;
    }
    if (images.length) messages.push({ role: "user", content: [{ type: "text", text: "Frames rendered by your last tool call:" }, ...images] });
    o.onStep(messages, spend);
    if (done !== null) return { done: true, summary: done, spend };
  }
  return { done: false, summary: "step limit reached", spend };
}
