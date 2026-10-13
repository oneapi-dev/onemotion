import { describe, expect, it } from "vitest";
import { SseAssembler, StreamError } from "./sse";

const ev = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`;

describe("SseAssembler", () => {
  it("joins text and tool-call pieces split across chunks and lines", () => {
    const a = new SseAssembler();
    const stream = [
      ev({ choices: [{ delta: { content: "Writing " } }] }),
      ev({ choices: [{ delta: { content: "files." } }] }),
      ev({ choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", type: "function", function: { name: "write_file", arguments: '{"path":"scene/' } }] } }] }),
      ev({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'index.tsx"}' } }] } }] }),
      ev({ choices: [{ delta: { tool_calls: [{ index: 1, id: "c2", function: { name: "check", arguments: "{}" } }] }, finish_reason: "tool_calls" }] }),
      ev({ choices: [], usage: { prompt_tokens: 100, completion_tokens: 20 } }),
      "data: [DONE]\n\n",
    ].join("");
    // Fed in awkward slices, the way a network delivers them.
    for (let i = 0; i < stream.length; i += 7) a.push(stream.slice(i, i + 7));
    const r = a.result();
    expect(a.done).toBe(true);
    expect(r.choices[0].message.content).toBe("Writing files.");
    expect(r.choices[0].message.tool_calls).toEqual([
      { id: "c1", type: "function", function: { name: "write_file", arguments: '{"path":"scene/index.tsx"}' } },
      { id: "c2", type: "function", function: { name: "check", arguments: "{}" } },
    ]);
    expect(r.choices[0].finish_reason).toBe("tool_calls");
    expect(r.usage).toEqual({ prompt_tokens: 100, completion_tokens: 20 });
  });

  it("throws on an error event mid-stream", () => {
    const a = new SseAssembler();
    expect(() => a.push(ev({ error: { message: "upstream timed out" } }))).toThrow(StreamError);
  });

  it("ignores comments and keep-alives", () => {
    const a = new SseAssembler();
    a.push(": keep-alive\n\n" + ev({ choices: [{ delta: { content: "ok" }, finish_reason: "stop" }] }));
    expect(a.result().choices[0]).toEqual({ message: { role: "assistant", content: "ok" }, finish_reason: "stop" });
  });
});
