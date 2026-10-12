import { describe, expect, it } from "vitest";
import type { Plan, PlanScene } from "@/engine/plan";
import { describeModel, enforceFacts, findUrl, matchModels, mentions } from "./facts";
import type { CatalogModel, DirectInput } from "./input";
import { parseAnswer, TruncatedAnswerError, userMessage } from "./prompt";
import { CODE_LINE_MAX, CODE_MAX_LINES, lengthWindow, LOOKS, MAX_SCENE, normalizePlan, PATHS, UnusablePlanError } from "./rules";

const input = (over: Partial<DirectInput> = {}): DirectInput => ({ prompt: "", format: "landscape", tone: "auto", ...over });
const model = (over: Partial<CatalogModel>): CatalogModel => ({
  id: "m",
  name: "",
  tagline: "",
  contextWindow: "",
  capabilities: [],
  inputPrice: "",
  outputPrice: "",
  listInput: "",
  listOutput: "",
  currency: "USD",
  free: false,
  ...over,
});
const plan = (scenes: PlanScene[], over: Partial<Plan> = {}) => ({ scenes, ...over }) as Partial<Plan> & { scenes: PlanScene[] };
const sc = (type: PlanScene["type"], over: Partial<PlanScene> = {}): PlanScene => ({ type, duration: 0, ...over });

describe("findUrl", () => {
  it.each([
    ["Buat video promosi tentang oneapi.id", "oneapi.id"],
    ["promo for https://acme.test/pricing, please", "https://acme.test/pricing"],
    ["launch video www.bookli.ai sekarang", "www.bookli.ai"],
    ["tutorial Node.js dan Next.js untuk pemula", ""],
    ["model baru mimo v2.6 sudah tersedia di oneapi", ""],
    ["see README.md for details", ""],
    ["video tentang toko kami di tokoku.co.id ya", "tokoku.co.id"],
  ])("%s", (text, want) => expect(findUrl(text)).toBe(want));
});

describe("mentions", () => {
  it("finds a name across case and spacing", () => {
    expect(mentions("Buat video promosi tentang One API", "oneapi")).toBe(true);
    expect(mentions("OneAPI's new model", "oneapi")).toBe(true);
  });
  it("ignores short names and absent ones", () => {
    expect(mentions("anything at all", "abc")).toBe(false);
    expect(mentions("a phone", "oneapi")).toBe(false);
  });
});

describe("catalog facts", () => {
  const models = [
    model({ id: "mimo-v2.6-pro", name: "MiMo V2.6 Pro" }),
    model({ id: "mimo-v2.6-flash", name: "MiMo V2.6 Flash" }),
    model({ id: "mimo-v2-flash", name: "MiMo V2 Flash" }),
    model({ id: "gpt-5", name: "GPT-5" }),
  ];
  it("matches the models a brief names", () => {
    expect(matchModels("video tentang perilisan model baru mimo v2.6 sudah tersedia di oneapi", models).map((m) => m.id)).toEqual(["mimo-v2.6-pro", "mimo-v2.6-flash"]);
    expect(matchModels("buat video promosi tentang oneapi", models)).toEqual([]);
  });
  it("describes prices and the saving", () => {
    const d = describeModel(model({ id: "mimo-v2.6-pro", name: "MiMo V2.6 Pro", inputPrice: "0.400000", outputPrice: "1.600000", listInput: "1.000000", listOutput: "4.000000", contextWindow: "1M" }));
    for (const want of ["input $0.4", "output $1.6", "input $1, output $4", "60% cheaper", "1M tokens"]) expect(d).toContain(want);
  });
});

describe("enforceFacts", () => {
  it("drops invented numbers and keeps sourced ones", () => {
    const inp = input({ prompt: "MiMo V2.6 sekarang tersedia di OneAPI, diskon 54%", models: [model({ id: "mimo-v2.6-pro", inputPrice: "0.4", outputPrice: "1.6" })] });
    const got = enforceFacts(
      {
        caption: "Hemat 54% #AI",
        scenes: [
          sc("announce", { eyebrow: "NEW MODEL", title: "MiMo V2.6 Pro" }),
          sc("stat", { value: "10x", title: "faster" }),
          sc("stat", { value: "99.9%", title: "uptime" }),
          sc("specs", { title: "Harga", items: [{ title: "Input", body: "$0.40" }, { title: "Output", body: "$1.60" }, { title: "Users", body: "12,000" }] }),
          sc("code", { body: "temperature: 0.73\nmax_tokens: 4096" }),
          sc("cta", { title: "Coba sekarang" }),
        ],
      },
      inp,
    );
    expect(got.scenes.map((s) => s.type)).toEqual(["announce", "stat", "specs", "code", "cta"]);
    expect(got.scenes[2].items).toHaveLength(2);
    expect(got.caption).not.toBe("");
  });
});

describe("normalizePlan", () => {
  it("repairs a plan and keeps the closing call to action last", () => {
    const got = normalizePlan(
      plan([
        sc("cta", { title: "Too early" }),
        sc("hook", { duration: 0.5, title: "Widgets that ship themselves, finally, for every team on the planet today" }),
        sc("screenshot", { shot: 7 }),
        sc("features", { items: [{ title: "Only one" }] }),
        sc("stat", { value: "10k+", title: "teams" }),
      ], { tone: "nonsense" as never, music: "jazz" as never, look: "neon" as never }),
      input(),
    );
    expect(got.scenes.map((s) => s.type)).toEqual(["hook", "stat", "cta"]);
    expect(got.scenes[2].title).toBe("Too early");
    expect([...(got.scenes[0].title ?? "")].length).toBeLessThanOrEqual(60);
    expect(got.tone).toBe("punchy");
    expect(got.music).toBe("drive");
    expect(got.look).toBe("graphite");
    for (const s of got.scenes) expect(s.duration).toBeLessThanOrEqual(MAX_SCENE);
  });

  it("refuses a plan with too little left", () => {
    expect(() => normalizePlan(plan([sc("hook")]), input())).toThrow(UnusablePlanError);
  });

  it("normalizes the widget scenes", () => {
    const got = normalizePlan(
      plan([
        sc("announce", { eyebrow: "NEW", title: "MiMo V2.6", items: [{ title: "Vision" }, { title: "1M context" }, { title: "Tools" }, { title: "Extra" }] }),
        sc("chat", { items: [{ title: "Assistant", body: "Hi" }, { title: "who?", body: "There" }, { title: "user", body: "" }] }),
        sc("code", { eyebrow: "main.py", body: "\tfrom openai import OpenAI\r\n" + "x".repeat(80) + "\n1\n2\n3\n4\n5\n6\n7\n8" }),
        sc("bars", { items: [{ title: "Official", body: "$1" }, { title: "OneAPI", body: "$0.4" }] }),
        sc("compare", { items: [{ title: "Many keys", body: "One key" }, { title: "Many bills", body: "One bill" }] }),
        sc("steps", { items: [{ title: "1. Buat API Key" }, { title: "Langkah 2: Pasang" }, { title: "3) Pilih model" }] }),
        sc("cta", { title: "Go" }),
      ]),
      input(),
    );
    const by = Object.fromEntries(got.scenes.map((s) => [s.type, s]));
    expect(by.announce.items).toHaveLength(3);
    expect(by.chat.items?.map((i) => i.title)).toEqual(["ai", "ai"]);
    const lines = (by.code.body ?? "").split("\n");
    expect(lines).toHaveLength(CODE_MAX_LINES);
    expect(lines[0].startsWith("  from openai")).toBe(true);
    expect([...lines[1]].length).toBe(CODE_LINE_MAX);
    expect(by.bars.items?.[0].highlight).toBe(true);
    expect([by.compare.left, by.compare.right]).toEqual(["Before", "After"]);
    expect(by.steps.items?.map((i) => i.title)).toEqual(["Buat API Key", "Pasang", "Pilih model"]);
  });

  it("a new take changes look, path and music", () => {
    const got = normalizePlan(plan([sc("hook", { title: "x" }), sc("statement", { title: "y" }), sc("cta", { title: "Go" })], { look: "midnight", path: "dolly", music: "pulse" }), input({ previous: { look: "midnight", path: "dolly", music: "pulse" } }));
    expect(got.look).not.toBe("midnight");
    expect(got.path).not.toBe("dolly");
    expect(got.music).not.toBe("pulse");
    expect(LOOKS).toContain(got.look);
    expect(PATHS).toContain(got.path);
  });

  it("uses only the website's color as the brand color", () => {
    const scenes = [sc("hook", { title: "x" }), sc("statement", { title: "y" }), sc("cta", { title: "Go" })];
    expect(normalizePlan(plan(scenes, { brand_color: "#123456" }), input()).brand_color).toBeUndefined();
    const site = { url: "", domain: "acme.test", name: "Acme", title: "", description: "", lang: "", headings: [], paragraphs: [], ctas: [], accent: "#FF5A1F", logo: null };
    expect(normalizePlan(plan(scenes), input({ site })).brand_color).toBe("#ff5a1f");
  });
});

describe("lengthWindow", () => {
  it.each([
    ["promo oneapi", "promo", [12, 25]],
    ["tutorial pakai python", "tutorial", [15, 40]],
    ["video 30 detik tentang oneapi", "promo", [28, 32]],
    ["a 15-20 second launch video", "launch", [13, 22]],
    ["tutorial dalam 3 langkah", "tutorial", [15, 40]],
    ["mimo v2.6 sudah tersedia", "announcement", [12, 25]],
  ])("%s", (prompt, archetype, want) => expect(lengthWindow(prompt, archetype)).toEqual(want));
});

describe("prompt", () => {
  it("carries the brief and catalog facts, and says there is no website", () => {
    const msg = userMessage(input({ prompt: "video tentang perilisan model baru mimo v2.6 sudah tersedia di oneapi", format: "portrait", models: [model({ id: "mimo-v2.6-pro", name: "MiMo V2.6 Pro", inputPrice: "0.4", outputPrice: "1.6" })] }));
    for (const want of ["BRIEF: video tentang perilisan", "CATALOG facts", "MiMo V2.6 Pro (API id mimo-v2.6-pro)", "No website was read", "api.oneapi.id/v1"]) expect(msg).toContain(want);
  });

  it("parses an answer in a code fence and refuses an empty, truncated one", () => {
    const answer = `{"archetype":"announcement","angle":"a","brand":"Acme","look":"paper","path":"staircase","tone":"clean","caption":"c","fonts":{"display":"Inter","body":"Inter"},"music":"bright","scenes":[{"type":"hook","title":"Hi"},{"type":"steps","items":[{"title":"Pick"},{"title":"Pay"},{"title":"Go"}]},{"type":"cta","title":"Try it"}]}`;
    const got = parseAnswer({ choices: [{ message: { content: "```json\n" + answer + "\n```" } }] }, input());
    expect(got.look).toBe("paper");
    expect(got.scenes).toHaveLength(3);
    expect(() => parseAnswer({ choices: [{ finish_reason: "length", message: { content: null } }] }, input())).toThrow(TruncatedAnswerError);
  });
});
