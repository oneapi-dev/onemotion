import { afterEach, describe, expect, it, vi } from "vitest";
import { jsonStep } from "./llm";

const reply = (content: string, tokens = 10) => new Response(JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: tokens, completion_tokens: 1 } }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe("jsonStep", () => {
  it("never sends response_format, which OneAPI cannot carry to every provider", async () => {
    const fetch = vi.fn(async () => reply('{"ok": true}'));
    vi.stubGlobal("fetch", fetch);
    const r = await jsonStep<{ ok: boolean }>({ key: "k", model: "claude-sonnet-5.5", messages: [{ role: "user", content: "hi" }] });
    expect(r.value).toEqual({ ok: true });
    const body = JSON.parse((fetch.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body).not.toHaveProperty("response_format");
  });

  it("reads JSON inside a fence or prose", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => reply('Here it is:\n```json\n{"a": 1}\n```')));
    expect((await jsonStep<{ a: number }>({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] })).value).toEqual({ a: 1 });
  });

  it("asks once more when the answer is not JSON, and counts both calls", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(reply("Sure! I will make a concept.", 10)).mockResolvedValueOnce(reply('{"title": "x"}', 20));
    vi.stubGlobal("fetch", fetch);
    const r = await jsonStep<{ title: string }>({ key: "k", model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(r.value).toEqual({ title: "x" });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(r.usage.prompt_tokens).toBe(30);
  });
});
