"use client";

import { describeModel, matchModels, mentions } from "@/director/facts";
import type { CatalogModel, SiteInfo } from "@/director/input";
import type { FilmFormat, FilmSpec } from "../film";
import type { FilmHost } from "../host";
import { filmMusic, musicPrompt, recordFilmVoice, type FilmVoice } from "../voice";
import { filmTiming } from "../timing";
import { filmSpecOf, normalizeConcept, type Concept } from "./concept";
import { jsonStep, type Msg, type Part } from "./llm";
import { addUsage, runAgent, type AgentEvent, type Price, type Spend } from "./loop";
import { reviewFilm, type Review } from "./review";
import { BEATS_INDEX, beatFile, beatOf, beatsIndex, beatView, ownsBeat, pool, snapshotBeat, stubBeat } from "./parallel";
import { LEAD_INTEGRATE, OVERLAP, beatTask, leadFoundationTask } from "./roles";
import { compile, sceneTools, webSearchTool, type AgentTool, type Workspace } from "./tools";

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
/** Steps for the lead's foundation, each beat agent, and the lead's joining pass; how many beat agents run at once. */
const FOUNDATION_STEPS = 8;
const BEAT_STEPS = 10;
const INTEGRATE_STEPS = 6;
const BEAT_CONCURRENCY = 3;
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
/** The pages read for this film: the website and the other addresses in the brief. */
const pagesOf = (site: SiteInfo | null, pages: SiteInfo[] = []) => [...(site ? [site] : []), ...pages.filter((p) => p.url !== site?.url)];

/** Images found on those pages, for the agents to fetch: real logos and icons. */
function imagesOf(site: SiteInfo | null, pages: SiteInfo[] = []): string {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const p of pagesOf(site, pages))
    for (const i of p.images ?? []) {
      if (seen.has(i.src)) continue;
      seen.add(i.src);
      lines.push(`- ${i.src}${i.alt ? ` (${i.alt})` : ""}`);
    }
  return lines.slice(0, 40).join("\n") || "(none found)";
}

/** Everything the pages say, for the creative director and the facts check (the agents get the concept's short list instead). */
function pageText(site: SiteInfo | null, pages: SiteInfo[] = []): string {
  return pagesOf(site, pages)
    .map((p) => `PAGE ${p.url}: "${p.title}". ${p.description}\n${(p.text ?? "").slice(0, 3000)}`)
    .join("\n\n");
}

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

async function makeConcept(o: { key: string; model: string; brief: string; site: SiteInfo | null; pages?: SiteInfo[]; models: CatalogModel[]; recent: RecentFilm[]; refs?: string[]; web?: boolean; signal?: AbortSignal; onActivity?: (text: string) => void }) {
  const { concept: system } = await loadPrompts();
  const user = [
    `BRIEF:\n${o.brief || "(none: make a launch film for the website)"}`,
    `FACTS:\n${factsOf(o.brief, o.site, o.models)}`,
    o.site?.accent ? `BRAND COLOUR: ${o.site.accent}` : "",
    pagesOf(o.site, o.pages).length ? `PAGES (read from the web just now):\n${pageText(o.site, o.pages)}` : "",
    pagesOf(o.site, o.pages).length ? `IMAGES ON THOSE PAGES (real logos and icons the film can use):\n${imagesOf(o.site, o.pages)}` : "",
    `RECENT FILMS (do not repeat their style, metaphor, world or music):\n${o.recent.length ? o.recent.map((r) => `- style "${r.style}", metaphor "${r.metaphor}", world "${r.world}", music ${r.track ?? r.genre}`).join("\n") : "(none)"}`,
    o.refs?.length ? `The person gave ${o.refs.length} screenshot(s) of the real product (REF images below): build at least one beat around remaking it.` : "",
    "Return the concept JSON.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await jsonStep({ key: o.key, model: o.model, messages: [{ role: "system", content: system }, { role: "user", content: o.refs?.length ? [{ type: "text", text: user }, ...refParts(o.refs)] : user }], temperature: 1, maxTokens: 8000, web: o.web, signal: o.signal, onProgress: (p) => o.onActivity?.(`the art director is ${p.chars ? `writing the concept (${(p.chars / 1000).toFixed(1)}k characters)` : "thinking about the concept"}`) });
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
  /** Other pages the brief names (pricing, docs, ...), read for facts and images. */
  pages?: SiteInfo[];
  /** Let the creative director and the lead search and read the web (OneAPI web search). */
  web?: boolean;
  host: () => FilmHost | null;
  /** The person's ElevenLabs key and voice, to record the voice-over before the scene is built. */
  voice?: FilmVoice & { apiKey: string };
  onVoice?: (clips: Record<number, Blob>) => void;
  onMusic?: (music: Blob) => void;
  /** What each agent is doing right now (null when it is done), for the person to see. */
  onActivity?: (who: string, text: string | null) => void;
  onConcept: (film: FilmState) => void;
  update: (film: FilmState) => void;
  signal?: AbortSignal;
}): Promise<FilmState> {
  const price = priceOf(o.models, o.model);
  const act = (text: string | null) => o.onActivity?.("film", text);
  act("the art director is thinking about the concept");
  const { concept, usage } = await makeConcept({ ...o, onActivity: act });
  let spec = filmSpecOf(concept, o.format, o.site, Math.floor(Math.random() * 1e6), o.recent.flatMap((r) => (r.track ? [r.track] : [])));
  let film: FilmState = { concept, spec, files: {}, modules: null, status: "building", summary: "", spend: addUsage(NO_SPEND, usage, price), log: [], reviews: [] };
  o.onConcept(film);

  // The voice is the clock: record it first, so the beats and every word cue follow the real lines.
  if (o.voice && concept.voiceover && spec.beats.some((b) => b.voice)) {
    try {
      act(`recording the voice-over with ${o.voice.voiceName}`);
      const rec = await recordFilmVoice({ spec, language: concept.language, apiKey: o.voice.apiKey, voice: o.voice, signal: o.signal, onLine: (done, total) => act(`recording the voice-over: line ${done} of ${total}`) });
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
      act("asking ElevenLabs Music for a bed");
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

  act(null);
  const host = o.host();
  if (!host) throw new Error("The preview is not ready.");
  // The facts check reads everything; the agents get the concept's short list, the catalog and the images found.
  const facts = `${o.brief}\n${factsOf(o.brief, o.site, o.models)}\n${pageText(o.site, o.pages)}`;
  const agentFacts = [concept.facts.length ? concept.facts.map((f) => `- ${f}`).join("\n") : "", factsOf(o.brief, o.site, o.models)].filter(Boolean).join("\n");
  const { agent: system, review: reviewSystem } = await loadPrompts();
  const context = [
    `BRIEF:\n${o.brief}`,
    `FACTS (the only numbers and claims allowed on screen; copy them exactly):\n${agentFacts}`,
    `IMAGES ON THE PRODUCT'S PAGES (fetch real logos and icons with fetch_image):\n${imagesOf(o.site, o.pages)}`,
    `CONCEPT:\n${JSON.stringify({ ...concept, score: spec.score }, null, 1)}`,
  ].join("\n\n");
  const refs = refParts(o.refs ?? []);
  const task = (text: string): Msg => ({ role: "user", content: refs.length ? [{ type: "text", text }, ...refs] : text });

  // The shared files every agent writes into (each only its own), and each beat's last version that passed the check.
  const { beats: timed } = filmTiming(spec.beats, spec.score);
  const ids = timed.map((b) => b.id);
  const files: Record<string, string> = { [BEATS_INDEX]: beatsIndex(ids), ...Object.fromEntries(ids.map((id) => [beatFile(id), stubBeat(id)])) };
  const good: Record<string, Record<string, string>> = Object.fromEntries(ids.map((id) => [id, { [beatFile(id)]: stubBeat(id) }]));
  const ledger: Spend = { ...film.spend };
  /** The newest version of the whole film that compiled, from any agent: the preview follows it. */
  let shown: Record<string, string> | null = null;
  const push = (patch: Partial<FilmState> = {}) => {
    film = { ...film, files: { ...files }, modules: shown, spend: { ...ledger }, ...patch };
    o.update(film);
  };
  const say = (who: string, e: AgentEvent) => push({ log: [...film.log, { ...e, text: `[${who}] ${e.text}` }].slice(-MAX_LOG) });
  const agent = (who: string, messages: Msg[], tools: AgentTool[], maxSteps: number) =>
    runAgent({
      key: o.key,
      model: o.model,
      messages,
      tools,
      maxSteps,
      budgetUsd: o.budgetUsd,
      price,
      spend: NO_SPEND,
      ledger,
      onEvent: (e) => say(who, e),
      onStep: () => push(),
      onActivity: (t) => o.onActivity?.(who, t),
      signal: o.signal,
    });

  // 1. The lead lays the foundation: theme, shared components, the stage. Beats are stubs.
  const lead: Workspace = { spec, facts, files, modules: null, dirty: true };
  const leadMessages: Msg[] = [{ role: "system", content: system }, task(leadFoundationTask({ context, beats: timed }))];
  const leadTools = (all: boolean) =>
    sceneTools(
      lead,
      host,
      () => {
        if (lead.modules) shown = lead.modules;
        push();
      },
      o.signal,
      {
        canWrite: (p) => p !== BEATS_INDEX && (all || beatOf(p) === null),
        writes: all ? `any file except ${BEATS_INDEX}` : "the theme, the shared components and scene/index.tsx (not the beats)",
      },
    );
  // Web search is the lead's own tool (OneAPI MCP), not the gateway's :online loop: that loop
  // does not carry a request that brings its own tools, and a failed search must not fail the step.
  const foundation = await agent("lead", leadMessages, o.web ? [...leadTools(false), webSearchTool(o.key, o.signal)] : leadTools(false), FOUNDATION_STEPS);
  o.onActivity?.("lead", null);
  // A foundation that never passed the check would break every beat: fall back to a plain stage.
  if (!(await compile(files, facts, o.signal)).ok) {
    files["scene/index.tsx"] = fallbackStage(concept);
    say("lead", { kind: "error", text: "the foundation did not pass the check; the beats build on a plain stage" });
  }
  if (o.signal?.aborted || foundation.summary === "budget reached") return finish(foundation);

  // 2. Every beat at once (a few at a time), each agent on its own file, seeing the others' last good versions.
  const shared = Object.fromEntries(Object.entries(files).filter(([p]) => beatOf(p) === null && p !== BEATS_INDEX));
  const results = await pool(
    timed.map((b, i) => async () => {
      const ws: Workspace = { spec, facts, files, modules: null, dirty: true };
      const tools = sceneTools(
        ws,
        host,
        () => {
          if (ws.modules) shown = ws.modules;
          push();
        },
        o.signal,
        {
          canWrite: ownsBeat(b.id),
          writes: `${beatFile(b.id)} and helpers in scene/beats/${b.id}/`,
          view: () => beatView(b.id, files, good),
          mine: (e) => e.startsWith(`scene/beats/${b.id}`),
          onPassed: () => {
            good[b.id] = snapshotBeat(b.id, files);
          },
          focus: { from: b.start, to: b.end, label: `beat ${b.id}, frames ${b.start} to ${b.end}` },
        },
      );
      o.onActivity?.(b.id, "starting");
      try {
        return await agent(b.id, [{ role: "system", content: system }, task(beatTask({ context, beat: b, index: i, beats: timed, notes: foundation.summary, shared }))], tools, BEAT_STEPS);
      } finally {
        o.onActivity?.(b.id, null);
      }
    }),
    BEAT_CONCURRENCY,
  );
  results.forEach((r, i) => {
    if (r.status === "rejected") say(ids[i], { kind: "error", text: `stopped: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}` });
  });
  // Each beat is its last version that passed: a half-finished edit does not reach the film.
  for (const id of ids) {
    for (const p of Object.keys(files)) if (ownsBeat(id)(p)) delete files[p];
    Object.assign(files, good[id]);
  }
  push();
  if (o.signal?.aborted || ledger.usd >= o.budgetUsd) return finish({ done: false, summary: o.signal?.aborted ? "stopped" : "budget reached" });

  // 3. The lead joins the beats into one film, then the art director's rounds.
  lead.dirty = true;
  leadMessages.push({ role: "user", content: LEAD_INTEGRATE });
  let r = await agent("lead", leadMessages, leadTools(true), INTEGRATE_STEPS);
  for (let round = 1; round <= MAX_REVIEWS && r.summary !== "budget reached" && !o.signal?.aborted; round++) {
    const c = await compile(files, facts, o.signal);
    if (!c.ok) break;
    shown = c.modules;
    say("review", { kind: "tool", text: `round ${round}: the art director is looking at the frames` });
    o.onActivity?.("review", `round ${round}: rendering labelled frames, then the art director looks at them`);
    const { review, usage: used } = await reviewFilm({ key: o.key, model: o.model, system: reviewSystem, spec, modules: c.modules, concept, facts, host, refs: o.refs, signal: o.signal });
    o.onActivity?.("review", null);
    Object.assign(ledger, addUsage(ledger, used, price));
    push({ reviews: [...film.reviews, review] });
    say("review", { kind: "say", text: `${review.score}/10${review.pass ? ", ready to ship" : ""}. ${review.summary}` });
    const todo = review.issues.filter((i) => i.severity !== "low");
    if (review.pass || !todo.length || round === MAX_REVIEWS) break;
    leadMessages.push({
      role: "user",
      content: `The art director reviewed rendered frames of the film with fresh eyes (score ${review.score}/10). Fix these in whichever files they live, keep what works, check your fixes with renders, then call finish:\n${todo.map((i) => `- [${i.severity}] ${i.tile ?? ""} ${i.problem} -> ${i.fix}`).join("\n")}`,
    });
    lead.dirty = true;
    r = await agent("lead", leadMessages, leadTools(true), REVISE_STEPS);
  }
  return finish(r);

  /** Whatever the agents did, the film is the last version that passes the check. */
  async function finish(last: { done: boolean; summary: string }): Promise<FilmState> {
    const final = await compile(files, facts, o.signal).catch(() => null);
    if (final?.ok) shown = final.modules;
    const ok = Boolean(shown);
    push({
      status: ok ? (last.done ? "done" : "stopped") : "failed",
      summary: ok ? last.summary : `The scene did not pass the check: ${(final?.errors ?? []).slice(0, 3).join("; ")}`,
    });
    return film;
  }
}

/** The stage a film falls back to when the lead's foundation never passed the check: the beats on the concept's background. */
function fallbackStage(c: Concept): string {
  const fonts: Record<string, string[]> = {};
  fonts[c.typography.display] = ["400", "700"];
  fonts[c.typography.text] = [...new Set([...(fonts[c.typography.text] ?? []), "400", "600"])];
  return `import { AbsoluteFill } from "remotion";
import { Beats } from "@kit";
import { BEATS } from "./beats";

export const fonts = ${JSON.stringify(fonts)};
export const background = ${JSON.stringify(c.palette.bg)};

export default function Scene() {
  return (
    <AbsoluteFill>
      <Beats of={BEATS} overlap={${OVERLAP}} />
    </AbsoluteFill>
  );
}
`;
}
