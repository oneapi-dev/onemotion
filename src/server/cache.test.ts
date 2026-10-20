import { describe, expect, it } from "vitest";
import { breakpointsFor, refusedBreakpoints, usesBreakpoints, withoutBreakpoints } from "./cache";
import { fromMessages, toMessages } from "./translate";

const MARK = { type: "ephemeral" } as const;
const messages = [
  { role: "system", content: [{ type: "text", text: "Be brief.", cache_control: MARK }] },
  { role: "user", content: [{ type: "text", text: "CONTEXT", cache_control: MARK }, { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } }] },
  { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "check", arguments: "{}" } }] },
  { role: "tool", tool_call_id: "c1", content: [{ type: "text", text: "ok", cache_control: MARK }] },
];

describe("prompt-cache breakpoints on the server", () => {
  it("keeps them for models that cache by breakpoint, and the Messages API", () => {
    expect(usesBreakpoints("anthropic/claude-sonnet-5-5", "chat")).toBe(true);
    expect(usesBreakpoints("google/gemini-3-pro", "chat")).toBe(true);
    expect(usesBreakpoints("whatever", "messages")).toBe(true);
    expect(usesBreakpoints("deepseek/deepseek-v4.1-flash", "chat")).toBe(false);
    expect(usesBreakpoints("openai/gpt-5", "chat")).toBe(false);
    expect(breakpointsFor(messages, "claude-opus-5-5", "chat")).toBe(messages);
  });

  it("removes them for providers that cache on their own, with system and tool text plain again", () => {
    const out = breakpointsFor(messages, "deepseek/deepseek-v4.1-flash", "chat") as typeof messages;
    expect(JSON.stringify(out)).not.toContain("cache_control");
    expect(out[0].content).toBe("Be brief.");
    expect(out[3].content).toBe("ok");
    expect(out[1].content).toEqual([{ type: "text", text: "CONTEXT" }, { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } }]);
    expect(withoutBreakpoints([{ role: "user", content: "plain" }])).toEqual([{ role: "user", content: "plain" }]);
  });

  it("knows a refusal of them when it sees one", () => {
    expect(refusedBreakpoints(400, "Extra inputs are not permitted: messages.0.content.0.cache_control")).toBe(true);
    expect(refusedBreakpoints(400, "max_tokens too large")).toBe(false);
    expect(refusedBreakpoints(500, "cache_control")).toBe(false);
  });

  it("carries them into Anthropic Messages: the system block, content blocks and tool results", () => {
    const m = toMessages({ model: "m", messages: messages as never }) as { system: unknown; messages: { content: Record<string, unknown>[] }[] };
    expect(m.system).toEqual([{ type: "text", text: "Be brief.", cache_control: MARK }]);
    expect(m.messages[0].content[0]).toEqual({ type: "text", text: "CONTEXT", cache_control: MARK });
    expect(m.messages[0].content[1].cache_control).toBeUndefined();
    expect(m.messages[2].content[0]).toEqual({ type: "tool_result", tool_use_id: "c1", content: "ok", cache_control: MARK });
  });

  it("counts what Anthropic read from and wrote to the cache as prompt", () => {
    const a = fromMessages({ content: [{ type: "text", text: "Hi" }], usage: { input_tokens: 10, output_tokens: 3, cache_read_input_tokens: 500, cache_creation_input_tokens: 90 } });
    expect(a.usage).toEqual({ prompt_tokens: 600, completion_tokens: 3, prompt_tokens_details: { cached_tokens: 500 } });
  });
});
