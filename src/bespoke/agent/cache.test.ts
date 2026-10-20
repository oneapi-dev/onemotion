import { describe, expect, it, vi } from "vitest";
import { dropsSystem, foldSystem, withCache, type Msg, type Part, type WireMsg } from "./llm";
import { pruneImages } from "./loop";

const marks = (ms: WireMsg[]) => ms.flatMap((m, i) => (Array.isArray(m.content) ? (m.content as Part[]).flatMap((p, k) => (p.cache_control ? [`${i}.${k}`] : [])) : []));

/** A conversation two steps in: system, task, then (assistant, tool result) per step. */
const convo: Msg[] = [
  { role: "system", content: "You build films." },
  { role: "user", content: "The task." },
  { role: "assistant", content: null, tool_calls: [{ id: "a", type: "function", function: { name: "timing", arguments: "{}" } }] },
  { role: "tool", tool_call_id: "a", content: "beats..." },
  { role: "assistant", content: null, tool_calls: [{ id: "b", type: "function", function: { name: "check", arguments: "{}" } }] },
  { role: "tool", tool_call_id: "b", content: "ok" },
];

describe("prompt-cache breakpoints", () => {
  it("marks the system prompt, the end of this step's prompt, the end of the last step's and the task", () => {
    const out = withCache(convo);
    expect(marks(out)).toEqual(["0.0", "1.0", "3.0", "5.0"]);
    // The conversation the loop keeps is never changed.
    expect(convo[0].content).toBe("You build films.");
    expect(out[5]).toEqual({ role: "tool", tool_call_id: "b", content: [{ type: "text", text: "ok", cache_control: { type: "ephemeral" } }] });
  });

  it("never marks more than four places, keeping the caller's own first", () => {
    const shared: Msg[] = [convo[0], { role: "user", content: [{ type: "text", text: "CONTEXT", cache_control: { type: "ephemeral" } }, { type: "text", text: "your beat" }] }, ...convo.slice(2)];
    const out = withCache(shared);
    expect(marks(out)).toEqual(["0.0", "1.0", "3.0", "5.0"]);
    expect((out[1].content as Part[])[1].cache_control).toBeUndefined();
  });

  it("puts a breakpoint on a message's last text, so a render's pictures before it are cached with it", () => {
    const frames: Msg[] = [convo[0], { role: "user", content: [{ type: "text", text: "Frames:" }, { type: "image_url", image_url: { url: "data:x" } }, { type: "text", text: "frame 3" }, { type: "image_url", image_url: { url: "data:y" } }] }];
    const parts = withCache(frames)[1].content as Part[];
    expect(parts.map((p) => Boolean(p.cache_control))).toEqual([false, false, true, false]);
  });

  it("asks nothing of a first call: system and task only", () => {
    expect(marks(withCache(convo.slice(0, 2)))).toEqual(["0.0", "1.0"]);
  });
});

describe("pruning renders", () => {
  const render = (n: number): Msg => ({ role: "user", content: [{ type: "text", text: `render ${n}` }, { type: "image_url", image_url: { url: `data:${n}` } }] });
  const pictures = (ms: Msg[]) => ms.filter((m) => Array.isArray(m.content) && m.content.some((p) => p.type === "image_url")).length;

  it("lets a few renders pile up, then clears them in one go, keeping the newest two and the task's screenshots", () => {
    const ms: Msg[] = [{ role: "system", content: "s" }, render(0)];
    for (let n = 1; n <= 4; n++) {
      ms.push(render(n));
      pruneImages(ms);
    }
    // Four renders and the task: nothing cleared yet, so the conversation's prefix did not change.
    expect(pictures(ms)).toBe(5);
    ms.push(render(5));
    pruneImages(ms);
    expect(pictures(ms)).toBe(3);
    expect(ms[1]).toEqual(render(0));
  });
});

describe("a route that drops system messages", () => {
  it("gets the instructions at the head of the first user message, with their breakpoint", () => {
    const out = foldSystem(withCache(convo));
    expect(out.some((m) => m.role === "system")).toBe(false);
    const first = out[0].content as Part[];
    expect(out[0].role).toBe("user");
    expect(first[0]).toMatchObject({ type: "text", cache_control: { type: "ephemeral" } });
    expect((first[0] as { text: string }).text).toContain("You build films.");
    expect((first[1] as { text: string }).text).toBe("The task.");
    expect(out).toHaveLength(convo.length - 1);
  });

  it("is found by asking back a password the system message holds, once per model", async () => {
    const answers = ["I don't know any password.", "TANGERINE-41"];
    const fetch = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: answers.shift() } }], usage: {} }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(await dropsSystem("k", "drops-it", undefined)).toBe(true);
    expect(await dropsSystem("k", "keeps-it", undefined)).toBe(false);
    expect(await dropsSystem("k", "drops-it", undefined)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
  });
});
