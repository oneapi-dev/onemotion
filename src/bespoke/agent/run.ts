"use client";

import { describeModel, matchModels, mentions } from "@/director/facts";
import type { CatalogModel, SiteInfo } from "@/director/input";
import type { FilmFormat, FilmSpec } from "../film";
import type { Sandbox } from "../host";
import { filmMusic, musicPrompt, recordFilmVoice, type FilmVoice } from "../voice";
import { filmTiming } from "../timing";
import { filmSpecOf, normalizeConcept, type Concept } from "./concept";
import { jsonStep, type Msg, type Part } from "./llm";
import { addUsage, runAgent, type AgentEvent, type Price, type Spend } from "./loop";
import { reviewFilm, type Review } from "./review";
import { compile, sceneTools, type Workspace } from "./tools";

/** A film being made or made: what the Studio keeps of a bespoke run. */
export type FilmState = {
  concept: Concept;
  spec: FilmSpec;
  files: Record<string, string>;
  /** The compiled scene of the last version that passed the check, or null before one did. */
  modules: Record<string, string> | null;
  status: "building" | "done" | "stopped" | "failed";
  summary: string;
  spend: Spend;
  log: AgentEvent[];
  /** The voice that read the voice-over, when it was recorded. */
  voice?: FilmVoice;
  /** The stored ElevenLabs music bed playing instead of the composed score, when one was made. */
  musicKey?: string;
  /** The art director's reviews, oldest first. */
  reviews: Review[];
};

/** What a recent film was, so the next one is different. */
export type RecentFilm = { style: string; metaphor: string; world: string; genre: string; track?: string };

export const NO_SPEND: Spend = { input: 0, output: 0, cached: 0, usd: 0 };
const MAX_STEPS = 18;
/** Review rounds after the build, and the steps the agent gets to fix each one. */
const MAX_REVIEWS = 2;
const REVISE_STEPS = 8;
const MAX_LOG = 200;

type Prompts = { concept: string; agent: string; review: string };
let prompts: Promise<Prompts> | null = null;
const loadPrompts = () => {
  prompts ??= fetch("/api/scene/prompt").then((r) => {
    if (!r.ok) throw new Error("The studio's prompts could not be loaded.");
    return r.json() as Promise<Prompts>;
  });
  prompts.catch(() => (prompts = null));
  return prompts;
};

export const priceOf = (models: CatalogModel[], id: string): Price => {
  const m = models.find((x) => x.id === id);
  const input = Number(m?.inputPrice);
  const output = Number(m?.outputPrice);
  return m && Number.isFinite(input) && Number.isFinite(output) ? { input, output } : null;
};

/** What the film may state: the website's own words, the real models a brief names, and OneAPI's catalog when the film is about OneAPI. */
function factsOf(brief: string, site: SiteInfo | null, models: CatalogModel[]): string {
  const lines: string[] = [];
  if (mentions(brief, "oneapi") || site?.domain.endsWith("oneapi.id")) {
    const chat = models.filter((m) => m.capabilities.includes("Chat")).map((m) => m.id);
    if (chat.length) lines.push(`Models available on OneAPI: ${chat.join(", ")}.`, "OneAPI's API base URL: https://api.oneapi.id/v1 (OpenAI-compatible chat completions).");
  }
  if (site) {
    lines.push(`Website ${site.domain}: "${site.title}". ${site.description}`);
    for (const h of site.headings.slice(0, 8)) lines.push(`- heading: ${h}`);
    for (const p of site.paragraphs.slice(0, 6)) lines.push(`- says: ${p}`);
    for (const c of site.ctas.slice(0, 4)) lines.push(`- button: ${c}`);
  }
  const named = matchModels(brief, models, 4);
  for (const m of named) lines.push(`- model: ${describeModel(m)}`);
  return lines.join("\n") || "(none beyond the brief)";
}

/** The creative director's concept: one call. */
/** The person's product screenshots as message parts, each labelled as UI to remake faithfully. */
const refParts = (refs: string[]): Part[] =>
  refs.flatMap((url, i): Part[] => [
    { type: "text", text: `REF ${i + 1}: a screenshot of the real product UI. Where the film shows this UI, remake it faithfully (layout, copy, colours) at a size that reads on a phone; never invent menu items or data it does not show.` },
    { type: "image_url", image_url: { url } },
  ]);

async function makeConcept(o: { key: string; model: string; brief: string; site: SiteInfo | null; models: CatalogModel[]; recent: RecentFilm[]; refs?: string[]; signal?: AbortSignal; onActivity?: (text: string) => void }) {
  const { concept: system } = await loadPrompts();
  const user = [
    `BRIEF:\n${o.brief || "(none: make a launch film for the website)"}`,
    `FACTS:\n${factsOf(o.brief, o.site, o.models)}`,
    o.site?.accent ? `BRAND COLOUR: ${o.site.accent}` : "",
    `RECENT FILMS (do not repeat their style, metaphor, world or music):\n${o.recent.length ? o.recent.map((r) => `- style "${r.style}", metaphor "${r.metaphor}", world "${r.world}", music ${r.track ?? r.genre}`).join("\n") : "(none)"}`,
    o.refs?.length ? `The person gave ${o.refs.length} screenshot(s) of the real product (REF images below): build at least one beat around remaking it.` : "",
    "Return the concept JSON.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await jsonStep({ key: o.key, model: o.model, messages: [{ role: "system", content: system }, { role: "user", content: o.refs?.length ? [{ type: "text", text: user }, ...refParts(o.refs)] : user }], temperature: 1, maxTokens: 8000, signal: o.signal, onProgress: (p) => o.onActivity?.(`the art director is ${p.chars ? `writing the concept (${(p.chars / 1000).toFixed(1)}k characters)` : "thinking about the concept"}`) });
  return { concept: normalizeConcept(r.value), usage: r.usage };
}

/**
 * Makes a bespoke film: the concept, then the agent builds the scene with
 * its tools, looking at its own renders. `update` gets every change of the
 * film's state, for the Studio to save and show.
 */
export async function makeFilm(o: {
  key: string;
  model: string;
  brief: string;
  site: SiteInfo | null;
  format: FilmFormat;
  models: CatalogModel[];
  recent: RecentFilm[];
  budgetUsd: number;
  /** Screenshots of the real product, as image data URLs: UI the film remakes faithfully. */
  refs?: string[];
  sandbox: () => Sandbox | null;
  /** The person's ElevenLabs key and voice, to record the voice-over before the scene is built. */
  voice?: FilmVoice & { apiKey: string };
  onVoice?: (clips: Record<number, Blob>) => void;
  onMusic?: (music: Blob) => void;
  /** What is happening right now, for the person to see. */
  onActivity?: (text: string) => void;
  onConcept: (film: FilmState) => void;
  update: (film: FilmState) => void;
  signal?: AbortSignal;
}): Promise<FilmState> {
  const price = priceOf(o.models, o.model);
  o.onActivity?.("the art director is thinking about the concept");
  const { concept, usage } = await makeConcept(o);
  let spec = filmSpecOf(concept, o.format, o.site, Math.floor(Math.random() * 1e6), o.recent.flatMap((r) => (r.track ? [r.track] : [])));
  let film: FilmState = { concept, spec, files: {}, modules: null, status: "building", summary: "", spend: addUsage(NO_SPEND, usage, price), log: [], reviews: [] };
  o.onConcept(film);

  // The voice is the clock: record it first, so the beats and every word cue follow the real lines.
  if (o.voice && spec.beats.some((b) => b.voice)) {
    try {
      o.onActivity?.(`recording the voice-over with ${o.voice.voiceName}`);
      const rec = await recordFilmVoice({ spec, language: concept.language, apiKey: o.voice.apiKey, voice: o.voice, signal: o.signal, onLine: (done, total) => o.onActivity?.(`recording the voice-over: line ${done} of ${total}`) });
      spec = rec.spec;
      film = { ...film, spec, voice: { voiceId: o.voice.voiceId, voiceName: o.voice.voiceName }, log: [...film.log, { kind: "tool", text: `voice-over: ${Object.keys(rec.clips).length} lines recorded with ${o.voice.voiceName}` }] };
      o.onVoice?.(rec.clips);
      o.update(film);
    } catch (err) {
      if (o.signal?.aborted) throw err;
      film = { ...film, log: [...film.log, { kind: "error", text: `The voice-over could not be recorded (${err instanceof Error ? err.message : String(err)}); the film is built without it.` }] };
      o.update(film);
    }
  }

  // The music: ElevenLabs Music on a paid plan, made for this film's world and length; the composed score otherwise.
  if (o.voice) {
    try {
      const seconds = filmTiming(spec.beats, spec.score).timing.total / 30 + 1;
      o.onActivity?.("asking ElevenLabs Music for a bed");
      const m = await filmMusic({ apiKey: o.voice.apiKey, prompt: musicPrompt({ style: concept.style, metaphor: concept.metaphor, genre: spec.score.genre, bpm: spec.score.bpm }), seconds, signal: o.signal });
      film = { ...film, musicKey: m.key, log: [...film.log, { kind: "tool", text: "music: made with ElevenLabs Music for this film" }] };
      o.onMusic?.(m.blob);
      o.update(film);
    } catch (err) {
      if (o.signal?.aborted) throw err;
      film = { ...film, log: [...film.log, { kind: "tool", text: `music: the composed score (${err instanceof Error ? err.message : String(err)})` }] };
      o.update(film);
    }
  }

  const sandbox = o.sandbox();
  if (!sandbox) throw new Error("The preview is not ready.");
  const facts = `${o.brief}\n${factsOf(o.brief, o.site, o.models)}`;
  const ws: Workspace = { spec, facts, files: {}, modules: null, dirty: false };
  const push = (patch: Partial<FilmState>) => {
    film = { ...film, files: { ...ws.files }, modules: ws.modules, ...patch };
    o.update(film);
  };
  const { agent: system, review: reviewSystem } = await loadPrompts();
  const say = (e: AgentEvent) => push({ log: [...film.log, e].slice(-MAX_LOG) });
  const messages: Msg[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: [
        {
          type: "text",
          text: [`BRIEF:\n${o.brief}`, `FACTS (the only numbers and claims allowed on screen):\n${factsOf(o.brief, o.site, o.models)}`, `CONCEPT:\n${JSON.stringify({ ...concept, score: spec.score }, null, 1)}`, "Build the film in scene/. Start with `timing`."].join("\n\n"),
        },
        ...refParts(o.refs ?? []),
      ],
    },
  ];
  const tools = sceneTools(ws, sandbox, () => push({}), o.signal);
  const agent = (maxSteps: number) =>
    runAgent({ key: o.key, model: o.model, messages, tools, maxSteps, budgetUsd: o.budgetUsd, price, spend: film.spend, onEvent: say, onStep: (_, spend) => push({ spend }), onActivity: o.onActivity, signal: o.signal });
  let r = await agent(MAX_STEPS);

  // The art director looks with fresh eyes; the same agent session fixes what it finds.
  for (let round = 1; round <= MAX_REVIEWS && r.summary !== "budget reached" && !o.signal?.aborted; round++) {
    if (ws.dirty || !ws.modules) {
      const c = await compile(ws.files, facts, o.signal);
      if (!c.ok) break;
      ws.modules = c.modules;
      ws.dirty = false;
    }
    say({ kind: "tool", text: `review ${round}: the art director is looking at the frames` });
    o.onActivity?.(`review ${round}: rendering labelled frames, then the art director looks at them`);
    const { review, usage: used } = await reviewFilm({ key: o.key, model: o.model, system: reviewSystem, spec, modules: ws.modules, concept, facts, sandbox, refs: o.refs, signal: o.signal });
    push({ spend: addUsage(film.spend, used, price), reviews: [...film.reviews, review] });
    say({ kind: "say", text: `Review ${round}: ${review.score}/10${review.pass ? ", ready to ship" : ""}. ${review.summary}` });
    const todo = review.issues.filter((i) => i.severity !== "low");
    if (review.pass || !todo.length || round === MAX_REVIEWS) break;
    messages.push({
      role: "user",
      content: `The art director reviewed rendered frames of your film with fresh eyes (score ${review.score}/10). Fix these, keep what works, check your fixes with renders, then call finish:\n${todo.map((i) => `- [${i.severity}] ${i.tile ?? ""} ${i.problem} -> ${i.fix}`).join("\n")}`,
    });
    r = await agent(REVISE_STEPS);
  }
  // Whatever the agent did, the film is the last version that passes the check.
  const final = await compile(ws.files, facts, o.signal);
  if (final.ok) ws.modules = final.modules;
  const ok = Boolean(ws.modules);
  push({
    spend: r.spend,
    status: ok ? (r.done ? "done" : "stopped") : "failed",
    summary: ok ? r.summary : `The scene did not pass the check: ${final.errors.slice(0, 3).join("; ")}`,
  });
  return film;
}
