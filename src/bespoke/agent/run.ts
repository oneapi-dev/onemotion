"use client";

import { describeModel, matchModels } from "@/director/facts";
import type { CatalogModel, SiteInfo } from "@/director/input";
import type { FilmFormat, FilmSpec } from "../film";
import type { Sandbox } from "../host";
import { filmSpecOf, normalizeConcept, type Concept } from "./concept";
import { chatStep, parseJson, type Msg } from "./llm";
import { addUsage, runAgent, type AgentEvent, type Price, type Spend } from "./loop";
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
};

/** What a recent film was, so the next one is different. */
export type RecentFilm = { style: string; metaphor: string; world: string; genre: string };

export const NO_SPEND: Spend = { input: 0, output: 0, cached: 0, usd: 0 };
const MAX_STEPS = 18;
const MAX_LOG = 200;

let prompts: Promise<{ concept: string; agent: string }> | null = null;
const loadPrompts = () => {
  prompts ??= fetch("/api/scene/prompt").then((r) => {
    if (!r.ok) throw new Error("The studio's prompts could not be loaded.");
    return r.json() as Promise<{ concept: string; agent: string }>;
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

/** What the film may state: the website's own words and the real models a brief names. */
function factsOf(brief: string, site: SiteInfo | null, models: CatalogModel[]): string {
  const lines: string[] = [];
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
async function makeConcept(o: { key: string; model: string; brief: string; site: SiteInfo | null; models: CatalogModel[]; recent: RecentFilm[]; signal?: AbortSignal }) {
  const { concept: system } = await loadPrompts();
  const user = [
    `BRIEF:\n${o.brief || "(none: make a launch film for the website)"}`,
    `FACTS:\n${factsOf(o.brief, o.site, o.models)}`,
    o.site?.accent ? `BRAND COLOUR: ${o.site.accent}` : "",
    `RECENT FILMS (do not repeat their style, metaphor, world or music):\n${o.recent.length ? o.recent.map((r) => `- style "${r.style}", metaphor "${r.metaphor}", world "${r.world}", music ${r.genre}`).join("\n") : "(none)"}`,
    "Return the concept JSON.",
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await chatStep({ key: o.key, model: o.model, messages: [{ role: "system", content: system }, { role: "user", content: user }], temperature: 1, maxTokens: 8000, json: true, signal: o.signal });
  return { concept: normalizeConcept(parseJson(r.text)), usage: r.usage };
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
  sandbox: () => Sandbox | null;
  onConcept: (film: FilmState) => void;
  update: (film: FilmState) => void;
  signal?: AbortSignal;
}): Promise<FilmState> {
  const price = priceOf(o.models, o.model);
  const { concept, usage } = await makeConcept(o);
  const spec = filmSpecOf(concept, o.format, o.site, Math.floor(Math.random() * 1e6));
  let film: FilmState = { concept, spec, files: {}, modules: null, status: "building", summary: "", spend: addUsage(NO_SPEND, usage, price), log: [] };
  o.onConcept(film);

  const sandbox = o.sandbox();
  if (!sandbox) throw new Error("The preview is not ready.");
  const ws: Workspace = { spec, files: {}, modules: null, dirty: false };
  const push = (patch: Partial<FilmState>) => {
    film = { ...film, files: { ...ws.files }, modules: ws.modules, ...patch };
    o.update(film);
  };
  const { agent: system } = await loadPrompts();
  const messages: Msg[] = [
    { role: "system", content: system },
    {
      role: "user",
      content: [`BRIEF:\n${o.brief}`, `FACTS (the only numbers and claims allowed on screen):\n${factsOf(o.brief, o.site, o.models)}`, `CONCEPT:\n${JSON.stringify({ ...concept, score: spec.score }, null, 1)}`, "Build the film in scene/. Start with `timing`."].join("\n\n"),
    },
  ];
  const r = await runAgent({
    key: o.key,
    model: o.model,
    messages,
    tools: sceneTools(ws, sandbox, () => push({}), o.signal),
    maxSteps: MAX_STEPS,
    budgetUsd: o.budgetUsd,
    price,
    spend: film.spend,
    onEvent: (e) => push({ log: [...film.log, e].slice(-MAX_LOG) }),
    onStep: (_, spend) => push({ spend }),
    signal: o.signal,
  });
  // Whatever the agent did, the film is the last version that passes the check.
  const final = await compile(ws.files, o.signal);
  if (final.ok) ws.modules = final.modules;
  const ok = Boolean(ws.modules);
  push({
    spend: r.spend,
    status: ok ? (r.done ? "done" : "stopped") : "failed",
    summary: ok ? r.summary : `The scene did not pass the check: ${final.errors.slice(0, 3).join("; ")}`,
  });
  return film;
}
