import type { ApiStyle } from "./translate";

/**
 * Prompt-cache breakpoints (`cache_control` on message parts), set by the
 * browser's agent loop, made to fit where a request goes. Claude and Gemini
 * cache only up to a breakpoint, so theirs are kept; OpenAI, DeepSeek, Grok
 * and the rest cache an unchanged prefix on their own and may refuse a field
 * they do not know, so theirs are removed (and a system or tool message
 * split into parts to hold one is a plain string again). The Anthropic
 * Messages translation carries them itself; Responses drops them. Pure.
 */

/** Models that cache only up to an explicit breakpoint. */
const BREAKPOINT_MODELS = /claude|anthropic|gemini/i;

export const usesBreakpoints = (model: string, api: ApiStyle) => api === "messages" || (api === "chat" && BREAKPOINT_MODELS.test(model));

type AnyPart = { type: string; text?: string; cache_control?: unknown } & Record<string, unknown>;
type AnyMessage = { role: string; content?: unknown } & Record<string, unknown>;

/** The messages with every breakpoint removed. */
export function withoutBreakpoints(messages: unknown[]): unknown[] {
  return messages.map((raw) => {
    const m = raw as AnyMessage;
    if (!Array.isArray(m.content)) return m;
    const parts = (m.content as AnyPart[]).map((p) => {
      if (!p || typeof p !== "object" || !("cache_control" in p)) return p;
      const rest = { ...p };
      delete rest.cache_control;
      return rest;
    });
    // A system or tool message the browser split into parts only to hold a breakpoint: one string again.
    if ((m.role === "system" || m.role === "tool") && parts.every((p) => p.type === "text")) return { ...m, content: parts.map((p) => p.text ?? "").join("") };
    return { ...m, content: parts };
  });
}

/** The messages as the target takes them: breakpoints kept where they are how it caches, removed elsewhere. */
export const breakpointsFor = (messages: unknown[], model: string, api: ApiStyle) => (usesBreakpoints(model, api) ? messages : withoutBreakpoints(messages));

/** Whether a provider refused a request because of the breakpoints. */
export const refusedBreakpoints = (status: number, message: string) => status === 400 && /cache_control|cache control|ephemeral/i.test(message);
