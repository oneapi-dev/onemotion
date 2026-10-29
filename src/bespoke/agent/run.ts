"use client";

import { describeModel, matchModels, mentions } from "@/director/facts";
import type { CatalogModel, SiteInfo } from "@/director/input";
import type { FilmFormat, FilmSpec } from "../film";
import type { FilmHost } from "../host";
import { filmMusic, musicPrompt, recordFilmVoice, type FilmVoice, type MusicSource } from "../voice";
import { parked } from "../runtime/qa";
import { FILM_FPS, filmTiming } from "../timing";
import { missingEdits, type ColorEdit, type TextEdit } from "../textEdit";
import type { Pronunciation } from "@/voice/spoken";
import { filmSpecOf, languageName, normalizeConcept, partnerOf, voiceLanguageOf, type Concept, type FilmPartner } from "./concept";
import type { Partner } from "../kit/film";
import { jsonStep, seesImages, sumUsage, type Msg, type Part } from "./llm";
import { CLOSE_FIX, crowdedClose, handTyped, isKinetic, isSlides, kineticGuard, silentBeats, slideIssues, SLIDES_FIX } from "./story";
import { addUsage, runAgent, type AgentEvent, type Price, type Spend } from "./loop";
import { reviewFilm, type Review } from "./review";
import { BEATS_INDEX, beatFile, beatOf, beatView, ownsBeat, pool, snapshotBeat } from "./parallel";
import { baselineFiles, gutted } from "./baseline";
import { LEAD_INTEGRATE, NO_FOUNDATION, REVISE_NOTE_STEPS, SOLO_STEPS, beatTask, leadFoundationTask, repairTask, reviseTask, soloTask } from "./roles";
import { applyRevision, brokenCues, normalizeRevision, reviseMessage, revisePrompt, type Locks, type RevisionPlan } from "./revise";
import { assetNames, compile, sceneTools, webSearchTool, type AgentTool, type Workspace } from "./tools";
import { IMAGE_NOTE, ILLUSTRATION_NOTE, imageTool, isGenerated, MAX_PICTURES, type ImageBudget, type ImageConfig } from "./imageTool";
import { missingFigures, unshownBeats } from "./coverage";
import { holdSameness, probeFrames, reviewTiles, settledWarnings } from "./review";
import { EXTRA_REVIEWS, MIN_SCORE, SHORT_FIX, thinness, tooShort } from "./floor";

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
  /** The app was closed while this film was being built: it holds what was built until then. */
  interrupted?: boolean;
  /** Words on screen the person changed by hand: AI edits keep them exactly as typed. */
  textEdits?: TextEdit[];
  /** Colours the person swapped by hand: AI edits keep them. */
  colorEdits?: ColorEdit[];
};

/** The automated QA's warnings worth a fix round: defects measured on the frames, not taste. */
export function qaIssues(warnings: string[]): string[] {
  return warnings.filter((w) => /cut by the|clipped by its own box|too small to read|overlap|runs over text|nearly empty|does not say|look nearly the same|covered by another element|empty card|freezes like slides|cut off by its container|spills out of its panel|places in one frame|nothing on this frame is big|share one layout|are the same slide|one bordered sheet/.test(w)).slice(0, 16);
}

/** A figure the QA saw in three places that the brief itself writes three times or more ("/ 1M TOKENS" on every price row): the person's own layout, not a defect. */
export function briefRepeats(warning: string, brief: string): boolean {
  const f = /^frame \d+: "([^"]+)" appears in \d+ places in one frame/.exec(warning)?.[1];
  if (!f) return false;
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "").replace(/us\$/g, "$");
  return norm(brief).split(norm(f)).length - 1 >= 3;
}

/** What a recent film was, so the next one is different. */
export type RecentFilm = {
  style: string;
  metaphor: string;
  world: string;
  genre: string;
  track?: string;
  /** The look it was built with, so the next film differs in skin and structure. */
  direction?: string;
  concept?: string;
  background?: string;
  signature?: string;
  display?: string;
};

/** A recent film as the creative director reads it. */
export const describeRecent = (r: RecentFilm) =>
  [
    r.direction ? `direction "${r.direction}"` : "",
    r.concept ? `concept "${r.concept}"` : "",
    `style "${r.style}"`,
    `metaphor "${r.metaphor}"`,
    `world "${r.world}"`,
    r.display ? `display font ${r.display}` : "",
    r.background ? `background motion "${r.background}"` : "",
    r.signature ? `signature "${r.signature}"` : "",
    `music ${r.track ?? r.genre}`,
  ]
    .filter(Boolean)
    .join(", ");

export const NO_SPEND: Spend = { input: 0, output: 0, cached: 0, usd: 0 };
/** Steps for the lead's foundation, each beat agent, and the lead's joining pass; how many beat agents run at once. */
const FOUNDATION_STEPS = 8;
const BEAT_STEPS = 10;
const INTEGRATE_STEPS = 6;
const BEAT_CONCURRENCY = 3;
/** Review rounds after the build, and the steps the agent gets to fix each one. */
const MAX_REVIEWS = 2;
const REVISE_STEPS = 8;
/** Measured defects handed to one repair round, after the art director's three. */
const REPAIR_QA = 5;
/** Steps the lead gets to fix check errors that would stop the film from playing. */
const REPAIR_STEPS = 4;
/** What the designer of a kinetic film is told up front: the baseline's runs are the engine to keep. */
const KINETIC_NOTE = `THIS IS A KINETIC FILM (the concept's look is Kinetic type): the baseline's headline beats are already <KineticType> runs, one shot a music beat, and the stations hard-cut. Keep that engine and make it this film's: rewrite the shots (words, styles, grounds, whips, fx, the drop's punch), and where a beat shows a thing, use the kinetic scene blocks (Graph, Counters, PromptBox, Chain, Hero, FlyWords, PictureShot...). The concept's own hero objects play between or behind the runs, never instead of them: a beat that places its words by hand is a defect the review measures.`;
/** How long a film waits for its preview to mount before giving up. */
const HOST_WAIT_MS = 30_000;
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

/** How a collaboration film treats its partner brand, for the art director and the designers. */
export function partnerNote(p: Partner): string {
  const name = p.name || p.url;
  return [
    `PARTNER: this is a collaboration film with ${name}${p.url ? ` (${p.url})` : ""}, a real partner the person named.`,
    p.lead === "equal"
      ? "Both brands carry the same weight: both logos, a palette drawn from both brand colours, and a close with both marks, both names (A × B) and both addresses."
      : `The film's own brand leads (its palette, voice and call to action); ${name} joins where the story brings the two together and stands beside it in the close (A × B).`,
    p.colors[0] ? `${name}'s brand colour: ${p.colors[0]}.` : "",
    `Its logo is <Mark partner/>; both marks together are <CoMark/>. Words like "partner", "together with" or "×" are allowed for ${name} only.`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The creative director's concept: one call. */
/** The person's product screenshots as message parts, each labelled as UI to remake faithfully. */
const refParts = (refs: string[]): Part[] =>
  refs.flatMap((url, i): Part[] => [
    { type: "text", text: `REF ${i + 1}: a screenshot of the real product UI. Where the film shows this UI, remake it faithfully (layout, copy, colours) at a size that reads on a phone; never invent menu items or data it does not show.` },
    { type: "image_url", image_url: { url } },
  ]);

async function makeConcept(o: { key: string; model: string; brief: string; site: SiteInfo | null; pages?: SiteInfo[]; partner?: Partner | null; models: CatalogModel[]; recent: RecentFilm[]; refs?: string[]; web?: boolean; images?: ImageConfig; voiceLanguage?: string; signal?: AbortSignal; onActivity?: (text: string) => void }) {
  const { concept: system } = await loadPrompts();
  const user = [
    `BRIEF:\n${o.brief || "(none: make a launch film for the website)"}`,
    `FACTS:\n${factsOf(o.brief, o.site, o.models)}`,
    o.voiceLanguage ? `NARRATION LANGUAGE: ${languageName(o.voiceLanguage)}. The person narrates this film in ${languageName(o.voiceLanguage)}: write every beat's "voice" line in ${languageName(o.voiceLanguage)}, even when the brief asks for on-screen words in another language (those stay as the brief says).` : "",
    o.site?.accent ? `BRAND COLOUR: ${o.site.accent}` : "",
    o.partner ? partnerNote(o.partner) : "",
    pagesOf(o.site, o.pages).length ? `PAGES (read from the web just now):\n${pageText(o.site, o.pages)}` : "",
    pagesOf(o.site, o.pages).length ? `IMAGES ON THOSE PAGES (real logos and icons the film can use):\n${imagesOf(o.site, o.pages)}` : "",
    `RECENT FILMS (differ from them in skin and structure: direction, concept, palette, display font, background motion, signature, metaphor, world, music):\n${o.recent.length ? o.recent.map((r) => `- ${describeRecent(r)}`).join("\n") : "(none)"}`,
    o.refs?.length ? `The person gave ${o.refs.length} screenshot(s) of the real product (REF images below): build at least one beat around remaking it.` : "",
    o.images ? ILLUSTRATION_NOTE : "",
    // Said last because it is read last: a cheaper model otherwise answers in a shape of its own (a production document), led by the brief's "output" section.
    'Return the concept JSON in exactly the schema above: one object with the top-level keys title, language, angle, style, metaphor, world, camera, components, typography, palette, look, brand, beats, score, music, music_alternates, voiceover, facts; every beat { "id", "says", "voice", "shows", "seconds", "moments" }. No other structure (no "project", "storyboard" or "deliverables" objects), whatever format the brief describes for the video itself.',
  ]
    .filter(Boolean)
    .join("\n\n");
  const r = await jsonStep(
    { key: o.key, model: o.model, messages: [{ role: "system", content: system }, { role: "user", content: o.refs?.length ? [{ type: "text", text: user }, ...refParts(o.refs)] : user }], maxTokens: 12000, web: o.web, signal: o.signal, onProgress: (p) => o.onActivity?.(`the art director is ${p.chars ? `writing the concept (${(p.chars / 1000).toFixed(1)}k characters)` : "thinking about the concept"}`) },
    normalizeConcept,
  );
  // A concept that is the brief's slogans, one per beat, in order, is asked once more for a story; if the answer is no better, the first one stays.
  const slides = isSlides(r.value.beats, o.brief);
  const crowded = crowdedClose(r.value.beats);
  const short = tooShort(r.value.beats, o.brief);
  if ((slides || crowded || short) && !o.signal?.aborted) {
    o.onActivity?.(slides ? "the art director is turning the slogans into a story" : "the art director is clearing the close");
    try {
      const again = await jsonStep(
        {
          key: o.key,
          model: o.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: o.refs?.length ? [{ type: "text", text: user }, ...refParts(o.refs)] : user },
            { role: "assistant", content: JSON.stringify(r.value) },
            { role: "user", content: [slides ? SLIDES_FIX : "", crowded ? CLOSE_FIX : "", short ? SHORT_FIX : ""].filter(Boolean).join("\n\n") },
          ],
          maxTokens: 12000,
          signal: o.signal,
        },
        normalizeConcept,
      );
      const better = !isSlides(again.value.beats, o.brief) && (!crowded || !crowdedClose(again.value.beats) || slides) && (!short || !tooShort(again.value.beats, o.brief) || slides || crowded);
      return { concept: better ? again.value : r.value, usage: sumUsage(r.usage, again.usage) };
    } catch (err) {
      if (o.signal?.aborted) throw err;
    }
  }
  return { concept: r.value, usage: r.usage };
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
  /** An interrupted build's concept and spec, to build from instead of asking for a new concept. */
  resume?: { concept: Concept; spec: FilmSpec };
  /** Screenshots of the real product, as image data URLs: UI the film remakes faithfully. */
  refs?: string[];
  /** Other pages the brief names (pricing, docs, ...), read for facts and images. */
  pages?: SiteInfo[];
  /** A collaboration film's partner brand, read from its website. */
  partner?: FilmPartner | null;
  /** Let the creative director and the lead search and read the web (OneAPI web search). */
  web?: boolean;
  /** The person's image endpoint: the designers may make illustrations with it. */
  images?: ImageConfig;
  /** Build with a team (a lead and one agent per beat, in parallel) instead of one designer: faster, less coherent. */
  team?: boolean;
  host: () => FilmHost | null;
  /** The person's ElevenLabs key and voice, to record the voice-over before the scene is built. */
  voice?: FilmVoice & { apiKey: string };
  /** Where music made for each film comes from, when the person chose that over the library: ElevenLabs Music (paid plan) or Stable Audio. */
  music?: MusicSource;
  /** The language the person narrates in (Settings), when it is not the film's own: the voice lines are written and spoken in it. */
  voiceLanguage?: string;
  /** How names, domains and acronyms are said (the project's over the studio's). */
  lexicon?: Pronunciation[];
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
  // A build that was interrupted resumes from its saved concept: the art director is not asked (or paid) again.
  if (!o.resume) act("the art director is thinking about the concept");
  // Asked alongside the concept: a model that does not receive images cannot review frames, and says so instead of guessing.
  const seeing = seesImages(o.key, o.model, o.signal);
  // A partner's website is read like the product's own pages: its words are facts, its images assets.
  const pages = [...(o.partner ? [o.partner.site] : []), ...(o.pages ?? [])];
  const partner = o.partner ? partnerOf(o.partner) : null;
  const made = o.resume ? { concept: o.resume.concept, usage: {} } : await makeConcept({ ...o, pages, partner, onActivity: act });
  const usage = made.usage;
  // The narration's own language, kept with the concept: every later recording of a line speaks it.
  const concept: Concept = o.voiceLanguage && o.voiceLanguage !== made.concept.language ? { ...made.concept, voiceLanguage: o.voiceLanguage } : made.concept;
  let spec = o.resume?.spec ?? filmSpecOf(concept, o.format, o.site, Math.floor(Math.random() * 1e6), o.recent.flatMap((r) => (r.track ? [r.track] : [])), o.partner);
  const notes: AgentEvent[] = (concept.notes ?? []).map((text) => ({ kind: "tool", text: `concept: ${text}` }));
  if (concept.music && concept.music !== "composed" && spec.track && spec.track !== concept.music && !o.resume)
    notes.push({ kind: "tool", text: `music: "${concept.music}" played in a recent video, so "${spec.track}" (the closest unused mood) plays instead` });
  let film: FilmState = { concept, spec, files: {}, modules: null, status: "building", summary: "", spend: addUsage(NO_SPEND, usage, price), log: notes, reviews: [] };
  o.onConcept(film);

  // The voice is the clock: record it first, so the beats and every word cue follow the real lines.
  // Narration turned on in Settings is the person's own choice: it wins over a concept that left the voice-over out.
  if (o.voice && spec.beats.some((b) => b.voice)) {
    try {
      act(`recording the voice-over with ${o.voice.voiceName}`);
      const rec = await recordFilmVoice({ spec, language: voiceLanguageOf(concept), apiKey: o.voice.apiKey, voice: o.voice, lexicon: o.lexicon, signal: o.signal, onLine: (done, total) => act(`recording the voice-over: line ${done} of ${total}`) });
      spec = rec.spec;
      film = { ...film, spec, voice: { voiceId: o.voice.voiceId, voiceName: o.voice.voiceName, ...(o.voice.tuning ? { tuning: o.voice.tuning } : {}) }, log: [...film.log, { kind: "tool", text: `voice-over: ${Object.keys(rec.clips).length} lines recorded with ${o.voice.voiceName}` }] };
      o.onVoice?.(rec.clips);
      o.update(film);
    } catch (err) {
      if (o.signal?.aborted) throw err;
      film = { ...film, log: [...film.log, { kind: "error", text: `The voice-over could not be recorded (${err instanceof Error ? err.message : String(err)}); the film is built without it.` }] };
      o.update(film);
    }
  }

  // The music: made for this film's world and length when the person chose it (ElevenLabs Music, Stable Audio); the library track otherwise.
  if (o.music) {
    try {
      const seconds = filmTiming(spec.beats, spec.score).timing.total / 30 + 1;
      const by = o.music.provider === "stableaudio" ? "Stable Audio" : "ElevenLabs Music";
      act(`asking ${by} for a bed`);
      const m = await filmMusic({ source: o.music, prompt: musicPrompt({ style: concept.style, metaphor: concept.metaphor, genre: spec.score.genre, bpm: spec.score.bpm }), seconds, signal: o.signal });
      film = { ...film, musicKey: m.key, log: [...film.log, { kind: "tool", text: `music: made with ${by} for this film` }] };
      o.onMusic?.(m.blob);
      o.update(film);
    } catch (err) {
      if (o.signal?.aborted) throw err;
      film = { ...film, log: [...film.log, { kind: "tool", text: `music: the library track (${err instanceof Error ? err.message : String(err)})` }] };
      o.update(film);
    }
  }

  act(null);
  // The preview mounts with the film's first update, and loads on demand: give it a moment.
  let host = o.host();
  for (let waited = 0; !host && waited < HOST_WAIT_MS && !o.signal?.aborted; waited += 250) {
    await new Promise((r) => setTimeout(r, 250));
    host = o.host();
  }
  if (!host) throw new Error("The preview is not ready.");
  // The facts check reads everything; the agents get the concept's short list, the catalog and the images found.
  const facts = `${o.brief}\n${factsOf(o.brief, o.site, o.models)}\n${pageText(o.site, pages)}`;
  const agentFacts = [concept.facts.length ? concept.facts.map((f) => `- ${f}`).join("\n") : "", factsOf(o.brief, o.site, o.models)].filter(Boolean).join("\n");
  const { agent: system, review: reviewSystem } = await loadPrompts();
  const context = [
    `BRIEF:\n${o.brief}`,
    `FACTS (the only numbers and claims allowed on screen; copy them exactly):\n${agentFacts}`,
    `IMAGES ON THE PRODUCT'S PAGES (fetch real logos and icons with fetch_image):\n${imagesOf(o.site, pages)}`,
    spec.partner ? partnerNote(spec.partner) : "",
    `CONCEPT:\n${JSON.stringify({ ...concept, score: spec.score }, null, 1)}`,
  ]
    .filter(Boolean)
    .join("\n\n");
  const refs = refParts(o.refs ?? []);
  // The context every agent's task opens with is its own part with a cache breakpoint: the agents of one film share it.
  const task = (text: string): Msg => {
    const own = text.startsWith(context) ? text.slice(context.length).trimStart() : null;
    const head: Part[] = own === null ? [{ type: "text", text }] : [{ type: "text", text: context, cache_control: { type: "ephemeral" } }, { type: "text", text: own }];
    return { role: "user", content: [...head, ...refs] };
  };

  // The shared files every agent writes into (each only its own), and each beat's last version that passed the check.
  const { beats: timed } = filmTiming(spec.beats, spec.score);
  const ids = timed.map((b) => b.id);
  // The film starts as the studio's baseline, written by code from the concept: it already plays and shows every beat's words, whatever the model does next.
  const baseline = baselineFiles(concept, timed, { name: spec.brand.name, url: spec.brand.url, ...(spec.partner ? { partner: spec.partner.name } : {}) });
  const files: Record<string, string> = { ...baseline };
  const good: Record<string, Record<string, string>> = Object.fromEntries(ids.map((id) => [id, { [beatFile(id)]: baseline[beatFile(id)] }]));
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
      price,
      spend: NO_SPEND,
      ledger,
      onEvent: (e) => say(who, e),
      onStep: () => push(),
      onActivity: (t) => o.onActivity?.(who, t),
      signal: o.signal,
    });

  const blind = !(await seeing);
  if (blind) {
    film = { ...film, log: [...film.log, { kind: "error", text: `${o.model} does not receive images on this connection: the agents work from the automated QA and the words on screen, and the art director's review is skipped` }] };
    o.update(film);
  }
  const sightNote = blind ? "\n\nYOU CANNOT SEE IMAGES on this connection: renders come back as QA lines and the words on screen, without pictures. Never conclude a frame is blank or the scene crashed because you see no picture; trust the QA and the TEXT ON SCREEN lines." : "";

  // Illustrations: one budget for the whole run, less the images a resumed build already made.
  const pictures: ImageBudget = { left: MAX_PICTURES - Object.keys(spec.assets ?? {}).filter((k) => isGenerated(spec.assetSources, k)).length };
  const imageNote = o.images ? `\n\n${IMAGE_NOTE}` : "";
  const kinetic = isKinetic(concept);
  const kineticNote = kinetic ? `\n\n${KINETIC_NOTE}` : "";
  const imageTools = (ws: Workspace, changed: () => void): AgentTool[] => (o.images ? [imageTool(ws, o.images, pictures, changed, o.signal, blind)] : []);
  // One designer builds the whole film (the default), or a team: a lead lays the foundation and one agent per beat builds on it.
  const lead: Workspace = { spec, facts, files, modules: null, dirty: true };
  const leadMessages: Msg[] = [{ role: "system", content: system }, task((o.team ? leadFoundationTask({ context, beats: timed }) : soloTask({ context, beats: timed })) + sightNote + imageNote + kineticNote)];
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
        blind,
        canWrite: (p) => p !== BEATS_INDEX && (all || beatOf(p) === null),
        writes: all ? `any file except ${BEATS_INDEX}` : "the theme, the shared components and scene/index.tsx (not the beats)",
        // Every version the designer's own check passes is one to fall back to.
        onPassed: () => {
          lastGood = { ...files };
        },
        guard: kinetic ? kineticGuard(() => files, ids) : undefined,
      },
    );
  /** The last version of the whole film that passed the check, files and all. */
  let lastGood: Record<string, string> | null = null;
  /** Checks the whole film; a pass is remembered as the version to fall back to. */
  const checkFilm = async () => {
    const c = await compile(files, facts, o.signal);
    if (c.ok) {
      lastGood = { ...files };
      shown = c.modules;
    }
    return c;
  };
  /**
   * The floor: a beat the designer cut to a sketch (or a stage that no longer
   * plays the beats) goes back to the baseline, kept only when the film still
   * passes the check with it.
   */
  const restoreGutted = async () => {
    const back = o.signal?.aborted ? [] : gutted(files, baseline);
    if (!back.length) return;
    const kept = Object.fromEntries(back.map((p) => [p, files[p]]));
    for (const p of back) files[p] = baseline[p];
    const c = await checkFilm().catch(() => null);
    if (c?.ok) say("lead", { kind: "error", text: `${back.join(", ")} ${back.length === 1 ? "was" : "were"} left thinner than the studio's baseline: back to the baseline` });
    else Object.assign(files, kept);
    push();
  };
  let repaired = "";
  /** The lead fixes the check's errors and nothing else; the same errors are not tried twice. */
  const repair = async (errors: string[], all: boolean) => {
    const key = errors.join("\n");
    if (o.signal?.aborted || key === repaired) return;
    repaired = key;
    say("lead", { kind: "error", text: `the film does not pass the check (${errors.length} error${errors.length === 1 ? "" : "s"}); fixing them` });
    leadMessages.push({ role: "user", content: repairTask(errors) });
    lead.dirty = true;
    await agent("lead", leadMessages, leadTools(all), REPAIR_STEPS);
  };
  // Web search is the lead's own tool (OneAPI MCP), not the gateway's :online loop: that loop
  // does not carry a request that brings its own tools, and a failed search must not fail the step.
  const webTools = o.web ? [webSearchTool(o.key, o.signal)] : [];
  const leadImages = imageTools(lead, () => {
    if (lead.modules) shown = lead.modules;
    push();
  });

  let r: { done: boolean; summary: string };
  if (!o.team) {
    r = await agent("lead", leadMessages, [...leadTools(true), ...webTools, ...leadImages], SOLO_STEPS);
    o.onActivity?.("lead", null);
    if (o.signal?.aborted) return finish(r);
  } else {
    const foundation = await agent("lead", leadMessages, [...leadTools(false), ...webTools, ...leadImages], FOUNDATION_STEPS);
    o.onActivity?.("lead", null);
    let notes = foundation.summary;
    let base = await checkFilm();
    if (!base.ok) {
      await repair(base.errors, false);
      base = await checkFilm();
    }
    if (!base.ok && !o.signal?.aborted) {
      // A broken shared file fails every check after it, even when nothing imports it: drop the
      // whole foundation and give the beats a plain stage.
      for (const p of Object.keys(files)) if (beatOf(p) === null && p !== BEATS_INDEX) delete files[p];
      Object.assign(files, { "scene/theme.ts": baseline["scene/theme.ts"], "scene/index.tsx": baseline["scene/index.tsx"] });
      notes = NO_FOUNDATION;
      say("lead", { kind: "error", text: "the foundation did not pass the check and was dropped; the beats build on the studio's baseline stage" });
      await checkFilm();
    }
    if (o.signal?.aborted) return finish(foundation);

    // Every beat at once (a few at a time), each agent on its own file, seeing the others' last good versions.
    const shared = Object.fromEntries(Object.entries(files).filter(([p]) => beatOf(p) === null && p !== BEATS_INDEX));
    const assets = assetNames(spec.assets ?? {});
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
            blind,
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
          return await agent(b.id, [{ role: "system", content: system }, task(beatTask({ context, beat: b, index: i, beats: timed, notes, shared, assets }) + imageNote)], [
            ...tools,
            ...imageTools(ws, () => {
              if (ws.modules) shown = ws.modules;
              push();
            }),
          ], BEAT_STEPS);
        } finally {
          o.onActivity?.(b.id, null);
        }
      }),
      BEAT_CONCURRENCY,
    );
    results.forEach((x, i) => {
      if (x.status === "rejected") say(ids[i], { kind: "error", text: `stopped: ${x.reason instanceof Error ? x.reason.message : String(x.reason)}` });
    });
    // Each beat is its last version that passed: a half-finished edit does not reach the film.
    for (const id of ids) {
      for (const p of Object.keys(files)) if (ownsBeat(id)(p)) delete files[p];
      Object.assign(files, good[id]);
    }
    push();
    if (o.signal?.aborted) return finish({ done: false, summary: "stopped" });

    // The lead joins the beats into one film.
    lead.dirty = true;
    leadMessages.push({ role: "user", content: LEAD_INTEGRATE });
    r = await agent("lead", leadMessages, leadTools(true), INTEGRATE_STEPS);
  }

  await restoreGutted();

  /** The words the last checked frames showed: what the storyboard gate reads. */
  let lastSeen: string | null = null;
  /** The measured defects the last round found. */
  let lastQa: string[] = [];
  /**
   * The best version the reviews saw (highest score, then fewest measured defects): a later round
   * or the last pass can make a film worse, and the film that ships is never worse than this one.
   */
  let best: { files: Record<string, string>; score: number; qa: number; round: number } | null = null;
  /** The score of the last reviewed version, which the last pass builds on. */
  let lastScore = 0;
  /** The measured defects of a version: the QA's warnings on its labelled stills, and what its code shows. */
  const defects = (warnings: string[], seen: string): string[] => {
    const unshown = unshownBeats(spec.beats, { rendered: seen });
    // A beat that shows some of its numbers but not all: "Cache hit rate" without its 95%.
    const missing = missingFigures(spec.beats, { rendered: seen })
      .filter((m) => !unshown.includes(m.id))
      .map((m) => `${m.id} never shows ${m.figures.join(", ")} on screen (its words: "${spec.beats.find((b) => b.id === m.id)?.says.slice(0, 80)}"): every number a beat promises is on screen at its hold, large enough to read`);
    const silent = silentBeats(spec.beats.length, files);
    const typed = kinetic ? handTyped(files, ids) : [];
    const thin = thinness(files, spec.beats.length);
    // Dashes the brief does not write itself: the tell of generated copy.
    const dashed = /[—–]/.test(o.brief) ? [] : [...new Set(seen.match(/[^\n—–]{0,24}[—–][^\n—–]{0,24}/g) ?? [])].slice(0, 3);
    return [
      // First: a round's repair takes only the first few measured defects.
      ...(typed.length ? [`${typed.join(", ")} place${typed.length === 1 ? "s its" : " their"} words by hand, though this is a kinetic film: cut each beat's type as a <KineticType> run of shots on the music's beat (at: onBeat(0, k, pulse)), or use a kinetic scene block (Graph, Counters, PromptBox, Chain, Hero, FlyWords...); the concept's own objects stay, between or behind the runs`] : []),
      // Kinetic type is centred and full frame on purpose: its beats differ by ground and shot, not by layout.
      ...qaIssues(warnings).filter((w) => !briefRepeats(w, o.brief) && !(kinetic && / share one layout /.test(w))),
      ...missing,
      ...(dashed.length ? [`the on-screen words use dashes (${dashed.map((d) => `"${d.trim()}"`).join(", ")}): rewrite them with a full stop, a comma or a colon`] : []),
      ...slideIssues(files),
      ...(thin ? [thin] : []),
      ...(silent ? [`${silent} beat${silent === 1 ? " has" : "s have"} no sound: every beat gets its <Sfx> on its key reveal (a hit on an impact, ticks on a count); the <World> already plays each camera move`] : []),
      ...(unshown.length ? [`the film never shows the words of ${unshown.join(", ")} (${unshown.map((id) => `"${spec.beats.find((b) => b.id === id)?.says.slice(0, 60)}"`).join("; ")}): every beat puts its on-screen words on screen`] : []),
    ];
  };
  /** Renders the labelled stills of the film as it is now and measures them, without a reviewer. */
  const measure = async (modules: Record<string, string>) => {
    const tiles = reviewTiles(spec);
    const probes = probeFrames(spec);
    const s = await host.stills({ spec, modules }, [...tiles.map((t) => t.frame), ...probes], o.signal, 0.5);
    return { seen: s.seen, warnings: settledWarnings(tiles, [...s.warnings, ...(await holdSameness(tiles, s.images.slice(0, tiles.length)))], probes) };
  };
  /** What the art director checks the film against: the brief and the concept's facts (whole web pages carry other offers and prices). */
  const reviewFacts = `${o.brief}
${agentFacts}${concept.voiceLanguage ? `\nNARRATION: the person narrates this film in ${languageName(concept.voiceLanguage)} by their own choice; the voice lines are heard, not shown, and do not break a brief that asks for on-screen words in another language.` : ""}`;
  // The art director's rounds.
  // Two rounds, and up to EXTRA_REVIEWS more while the film is under the floor (the break below decides).
  for (let round = 1; round <= MAX_REVIEWS + EXTRA_REVIEWS && !o.signal?.aborted; round++) {
    let c = await checkFilm();
    if (!c.ok) {
      await repair(c.errors, true);
      c = await checkFilm();
    }
    // A repair that fixed one file and broke another must not end the reviews: the last version that passed is reviewed instead.
    if (!c.ok && lastGood && !o.signal?.aborted) {
      for (const p of Object.keys(files)) delete files[p];
      Object.assign(files, lastGood);
      lead.dirty = true;
      say("review", { kind: "error", text: `the film still failed the check after a repair (${c.errors[0]?.slice(0, 120) ?? ""}); reviewing the last version that passed` });
      c = await checkFilm();
    }
    if (!c.ok) break;
    if (blind && round === 1) say("review", { kind: "error", text: `${o.model} does not receive images on this connection, so it cannot review the frames: the automated QA checks them instead` });
    say("review", { kind: "tool", text: blind ? `round ${round}: the automated QA checks the rendered frames` : `round ${round}: the art director is looking at the frames` });
    o.onActivity?.("review", `round ${round}: rendering labelled frames${blind ? " for the automated QA" : ", then the art director looks at them"}`);
    let reviewed: Awaited<ReturnType<typeof reviewFilm>>;
    try {
      reviewed = blind ? { review: null, usage: {}, ...(await measure(c.modules)) } : await reviewFilm({ key: o.key, model: o.model, system: reviewSystem, spec, modules: c.modules, concept, facts: reviewFacts, host, refs: o.refs, skip: (w) => briefRepeats(w, o.brief), signal: o.signal });
    } catch (err) {
      // A scene that throws while a frame renders (a cue it cannot read, a hook outside its beat) is a defect to fix, not the end of the film.
      if (o.signal?.aborted) throw err;
      o.onActivity?.("review", null);
      const msg = err instanceof Error ? err.message : String(err);
      say("review", { kind: "error", text: `the film crashed while its frames rendered (${msg.slice(0, 160)}); the designer fixes it` });
      await repair([`the scene throws while rendering, so no frame of the film can be drawn: ${msg}. Find the line that throws and fix it (useBeat() works only inside a beat's own component, never in a <World> child or a shared component used outside a beat), then render_frames to see it draw.`], true);
      continue;
    }
    const { review, usage: used, warnings, seen } = reviewed;
    o.onActivity?.("review", null);
    Object.assign(ledger, addUsage(ledger, used, price));
    if (review) {
      push({ reviews: [...film.reviews, review] });
      say("review", { kind: "say", text: `${review.score}/10${review.pass ? ", ready to ship" : ""}. ${review.summary}` });
    } else if (!blind) say("review", { kind: "error", text: "the art director's answer could not be read; fixing what the automated QA found" });
    // The automated QA is a gate, not advice: text cut, overlapping, too small or a frame with nothing on it is fixed whatever the review says.
    lastSeen = seen;
    const qa = defects(warnings, seen);
    // A review that could not be read says nothing about the score: the measured defects decide against the best version.
    lastScore = review?.score ?? best?.score ?? 0;
    if (!best || lastScore > best.score || (lastScore === best.score && qa.length < best.qa)) best = { files: { ...files }, score: lastScore, qa: qa.length, round };
    // A bounded repair: the art director's three largest defects and the first measured ones. Many notes at once make a film worse.
    const todo = [...(review?.issues ?? []).map((i) => `- [${i.severity}] ${i.tile ?? ""} ${i.problem} -> ${i.fix}`), ...qa.slice(0, REPAIR_QA).map((w) => `- [qa] ${w}`)];
    lastQa = qa;
    const belowFloor = review !== null && review.score < MIN_SCORE;
    const lastRound = round >= MAX_REVIEWS + (belowFloor || (blind && qa.length) ? EXTRA_REVIEWS : 0);
    if ((review?.pass && !qa.length) || !todo.length || lastRound) break;
    if (round >= MAX_REVIEWS) say("review", { kind: "error", text: `${review ? `score ${review.score}/10 is under the studio's floor of ${MIN_SCORE}` : "the QA still finds defects"}: another round` });
    leadMessages.push({
      role: "user",
      content: `${review ? `The art director judged the rendered frames with fresh eyes (score ${review.score}/10).` : "The film's frames were rendered and checked."} Patch exactly these defects, in place, in the files where they live, and change nothing else: do not rework beats that are not named and do not add effects (the [qa] lines are measured on the frames: each one is real). Then render the frames you changed, confirm each defect is gone, and call finish:\n${todo.join("\n")}`,
    });
    lead.dirty = true;
    r = await agent("lead", leadMessages, leadTools(true), REVISE_STEPS);
  }
  // The reviews are over; measured defects are not taste: one more round fixes what the QA still found (text too small, an empty frame, a missing sound).
  if (lastQa.length && !o.signal?.aborted) {
    say("review", { kind: "tool", text: `fixing ${lastQa.length} measured defect${lastQa.length === 1 ? "" : "s"} the QA still found` });
    leadMessages.push({ role: "user", content: `Last pass: the automated QA still measures these defects on the rendered frames. Fix every one of them (they are measured, not taste), change nothing else, render the frames to confirm, then call finish:\n${lastQa.slice(0, REPAIR_QA).map((w) => `- ${w}`).join("\n")}` });
    lead.dirty = true;
    r = await agent("lead", leadMessages, leadTools(true), REVISE_STEPS);
    // The last pass is measured like a round: it ships only when it is no worse than the best version reviewed.
    const c = await checkFilm().catch(() => null);
    // A last pass that throws while rendering counts as one that does not pass: the best version ships.
    const m = c?.ok && !o.signal?.aborted ? await measure(c.modules).catch(() => null) : null;
    const after = m ? defects(m.warnings, m.seen) : null;
    if (best && (!after || lastScore < best.score || after.length > best.qa)) {
      for (const p of Object.keys(files)) delete files[p];
      Object.assign(files, best.files);
      lead.dirty = true;
      say("review", { kind: "error", text: `the last pass left ${after ? `${after.length} measured defect${after.length === 1 ? "" : "s"}` : "a film that does not pass the check"}; the film is round ${best.round}'s version (score ${best.score}/10, ${best.qa} measured defect${best.qa === 1 ? "" : "s"})` });
    }
  } else if (best && lastScore < best.score && !o.signal?.aborted) {
    // A later round scored lower than an earlier one: the earlier version ships.
    for (const p of Object.keys(files)) delete files[p];
    Object.assign(files, best.files);
    lead.dirty = true;
    say("review", { kind: "error", text: `round ${best.round} scored higher (${best.score}/10) than the last round (${lastScore}/10): the film is round ${best.round}'s version` });
  }
  // Flashing: the version that ships is scanned for light and dark flips faster than three a second (a seizure risk); one fix when found.
  if (!o.signal?.aborted) {
    const c = await checkFilm().catch(() => null);
    const scan = c?.ok ? await host.motionScan({ spec, modules: c.modules }, o.signal).catch(() => null) : null;
    const flashing = scan?.flashing ?? [];
    // A kinetic film is held to the style's measured gates (the scenario-kinetic-film skill): it never parks.
    const parks = kinetic && scan && !flashing.length ? parked(scan.still, FILM_FPS) : [];
    if (parks.length && !o.signal?.aborted) {
      say("review", { kind: "error", text: `the film parks: ${parks[0]}` });
      const kept = { ...files };
      leadMessages.push({ role: "user", content: `The film stands still where a kinetic film keeps moving: ${parks.join("; ")}. Fix only that: put the next shot on the beat, or keep the hold alive (the KineticType camera drift, ghost rows, a slow scale). Change nothing else, check, then call finish.` });
      lead.dirty = true;
      r = await agent("lead", leadMessages, leadTools(true), REPAIR_STEPS);
      if (!(await checkFilm().catch(() => null))?.ok) {
        for (const p of Object.keys(files)) delete files[p];
        Object.assign(files, kept);
        lead.dirty = true;
      }
    }
    if (flashing.length && !o.signal?.aborted) {
      say("review", { kind: "error", text: `the film flashes: ${flashing[0]}` });
      const kept = { ...files };
      leadMessages.push({ role: "user", content: `The film flashes, a seizure risk: ${flashing.join("; ")}. Fix only that: make the change with position, scale or colour of the same brightness, or slow it to fewer than three flips a second. Change nothing else, check, then call finish.` });
      lead.dirty = true;
      r = await agent("lead", leadMessages, leadTools(true), REPAIR_STEPS);
      if (!(await checkFilm().catch(() => null))?.ok) {
        for (const p of Object.keys(files)) delete files[p];
        Object.assign(files, kept);
        lead.dirty = true;
      }
    }
  }
  return finish(r);

  /** Whatever the agents did, the film is the last version that passes the check, and its files are that version's. */
  async function finish(last: { done: boolean; summary: string }): Promise<FilmState> {
    await restoreGutted();
    let final = await checkFilm().catch(() => null);
    if (final && !final.ok && !o.signal?.aborted) {
      await repair(final.errors, true).catch(() => undefined);
      final = await checkFilm().catch(() => null);
    }
    let summary = last.summary;
    if (final && !final.ok && lastGood && !o.signal?.aborted) {
      // The last edits broke it: go back to the version that played, so what is saved is what is shown.
      for (const p of Object.keys(files)) delete files[p];
      Object.assign(files, lastGood);
      final = await checkFilm().catch(() => null);
      summary = `${last.summary} (the last edits did not pass the check, so the film is its last version that did)`;
      say("lead", { kind: "error", text: "the last edits did not pass the check; kept the last version that did" });
    }
    // A film that shows almost none of its storyboard (a debug dump, a blank stage) is not done, whatever its agent said.
    const unshown = final?.ok ? unshownBeats(spec.beats, lastSeen !== null ? { rendered: lastSeen } : files) : [];
    if (final?.ok && spec.beats.length && unshown.length > spec.beats.length * 0.6 && !o.signal?.aborted) {
      push({ status: "failed", summary: `The film does not show its storyboard: ${unshown.length} of ${spec.beats.length} beats never put their words on screen. Try again, or choose a stronger model.` });
      return film;
    }
    const ok = Boolean(final?.ok || shown);
    push({
      // Built and checked is done, even when the agent ran out of steps before calling finish; "stopped" is the person stopping it.
      status: ok ? (o.signal?.aborted ? "stopped" : "done") : "failed",
      summary: ok ? summary : `The scene did not pass the check: ${(final?.errors ?? []).slice(0, 3).join("; ")}`,
    });
    return film;
  }
}

/** What one note on a finished film did. */
export type Revision = {
  film: FilmState;
  plan: RevisionPlan;
  /** Parts of the plan the locks refused. */
  refused: string[];
  /** Whether the code was edited, the voice re-recorded, the music changed. */
  changed: { code: boolean; voice: number; music: boolean };
};

/**
 * "Improve with AI" on a finished film: the editor turns the note into a
 * plan over the film's state, the locks are kept by applyRevision, changed
 * voice lines (only those) are recorded again, and the designer edits the
 * existing code when the plan needs it. A revision that leaves the film
 * unable to play is undone: the film comes back as it was.
 */
export async function reviseFilm(o: {
  key: string;
  model: string;
  film: FilmState;
  brief: string;
  site: SiteInfo | null;
  models: CatalogModel[];
  note: string;
  locks: Locks;
  targets: string[];
  host: () => FilmHost | null;
  voice?: FilmVoice & { apiKey: string };
  lexicon?: Pronunciation[];
  onActivity?: (who: string, text: string | null) => void;
  update: (film: FilmState) => void;
  signal?: AbortSignal;
}): Promise<Revision> {
  const price = priceOf(o.models, o.model);
  const act = (text: string | null) => o.onActivity?.("film", text);
  const before = o.film;
  act("the editor is reading your note");
  const { value: plan, usage } = await jsonStep(
    {
      key: o.key,
      model: o.model,
      messages: [
        { role: "system", content: revisePrompt() },
        { role: "user", content: reviseMessage({ note: o.note, locks: o.locks, targets: o.targets, concept: before.concept, spec: before.spec }) },
      ],
      maxTokens: 8000,
      signal: o.signal,
    },
    (v) => normalizeRevision(v, before.spec),
  );
  // The person's selection wins over the editor's.
  if (o.targets.length) plan.targets = o.targets;
  const applied = applyRevision(before, plan, o.locks);
  // A note's numbers are the person's own (new prices, a discount): facts from now on, for this edit and the next.
  if (/\d/.test(o.note)) applied.concept = { ...applied.concept, facts: [...applied.concept.facts, `The person's note, which wins over older facts: ${o.note.replace(/\s+/g, " ").trim().slice(0, 400)}`] };
  const ledger = addUsage(before.spend, usage, price);
  const log = (text: string, kind: AgentEvent["kind"] = "tool"): AgentEvent => ({ kind, text: `[edit] ${text}` });
  let film: FilmState = {
    ...before,
    concept: applied.concept,
    spec: applied.spec,
    files: applied.files,
    status: "building",
    spend: ledger,
    log: [...before.log, log(`note: ${o.note}`, "say"), log(plan.summary || "planned"), ...applied.refused.map((r) => log(`kept as it was: ${r}`))].slice(-MAX_LOG),
  };
  o.update(film);

  // Only the lines that changed are recorded again; the rest come from this browser's store.
  let voiced = 0;
  if (applied.revoice.length && o.voice && before.voice) {
    act(`recording ${applied.revoice.length} changed line${applied.revoice.length === 1 ? "" : "s"}`);
    const rec = await recordFilmVoice({ spec: film.spec, language: voiceLanguageOf(film.concept), apiKey: o.voice.apiKey, voice: before.voice, lexicon: o.lexicon, only: applied.revoice, signal: o.signal });
    voiced = Object.keys(rec.clips).length;
    film = { ...film, spec: rec.spec, log: [...film.log, log(`voice-over: ${voiced} line${voiced === 1 ? "" : "s"} recorded again`)] };
    o.update(film);
  }

  // Words the person typed by hand are facts too: a number they wrote is theirs to show.
  const hand = before.textEdits ?? [];
  const partner = before.spec.partner;
  const facts = `${o.brief}\n${factsOf(o.brief, o.site, o.models)}${partner ? `\nPartner: ${partner.name} (${partner.url})` : ""}${hand.length ? `\n${hand.map((e) => e.now).join("\n")}` : ""}\n${film.concept.facts.join("\n")}`;
  const broken = brokenCues(film.files, filmTiming(film.spec.beats, film.spec.score).beats);
  const changedBeats = film.spec.beats.filter((b) => {
    const was = before.spec.beats.find((x) => x.id === b.id);
    return !was || was.says !== b.says || was.voice !== b.voice || was.seconds !== b.seconds;
  });
  let code = false;
  if ((applied.code || broken.length) && !o.signal?.aborted) {
    const host = o.host();
    if (!host) throw new Error("The preview is not ready.");
    code = true;
    const { agent: system } = await loadPrompts();
    const context = [`BRIEF:\n${o.brief}`, `FACTS (the only numbers and claims allowed on screen; the person's note wins over older ones):\n${[film.concept.facts.map((f) => `- ${f}`).join("\n"), factsOf(o.brief, o.site, o.models)].filter(Boolean).join("\n")}`, film.spec.partner ? partnerNote(film.spec.partner) : "", `CONCEPT:\n${JSON.stringify({ ...film.concept, score: film.spec.score }, null, 1)}`, hand.length ? `THE PERSON'S OWN WORDS (typed by hand on screen; keep each one exactly as written, character for character, where it is):\n${hand.map((e) => `- ${JSON.stringify(e.now)}`).join("\n")}` : "", before.colorEdits?.length ? `THE PERSON'S OWN COLOURS (swapped by hand; keep them unless the note asks to change them):\n${before.colorEdits.map((e) => `- ${e.now} where the film had ${e.was}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
    const locked = (Object.entries(o.locks) as [keyof Locks, boolean][]).filter(([, v]) => v).map(([k]) => k);
    const ws: Workspace = { spec: film.spec, facts, files: film.files, modules: null, dirty: true };
    const blind = !(await seesImages(o.key, o.model, o.signal));
    const sight = blind ? "\n\nYOU CANNOT SEE IMAGES on this connection: renders come back as QA lines and the words on screen, without pictures. Never conclude a frame is blank or the scene crashed because you see no picture; trust the QA and the TEXT ON SCREEN lines." : "";
    const messages: Msg[] = [{ role: "system", content: system }, { role: "user", content: reviseTask({ context, note: o.note, summary: plan.summary, design: plan.design, targets: plan.targets, locked, broken, changedBeats: changedBeats.map((b) => b.id) }) + sight }];
    const tools = sceneTools(
      ws,
      host,
      () => {
        film = { ...film, files: { ...ws.files }, modules: ws.modules ?? film.modules, spend: { ...ledger } };
        o.update(film);
      },
      o.signal,
      { blind, canWrite: (p) => p !== BEATS_INDEX, writes: `any file except ${BEATS_INDEX}` },
    );
    const designer = (msgs: Msg[], steps: number) =>
      runAgent({ key: o.key, model: o.model, messages: msgs, tools, maxSteps: steps, price, spend: NO_SPEND, ledger, signal: o.signal, onActivity: (t) => o.onActivity?.("lead", t), onStep: () => o.update({ ...film, spend: { ...ledger } }), onEvent: (e) => (film = { ...film, log: [...film.log, { ...e, text: `[lead] ${e.text}` }].slice(-MAX_LOG) }) });
    const r = await designer(messages, REVISE_NOTE_STEPS);
    o.onActivity?.("lead", null);
    // The person's own words are kept by this code, not by asking nicely: a revision that lost one puts it back.
    const lost = missingEdits(ws.files, hand);
    if (lost.length && !o.signal?.aborted) {
      messages.push({ role: "user", content: `These words the person typed by hand are no longer on screen. Put each one back exactly as written, where it was, and change nothing else:\n${lost.map((e) => `- ${JSON.stringify(e.now)}`).join("\n")}` });
      await designer(messages, REPAIR_STEPS);
    }
    let c = await compile(ws.files, facts, o.signal);
    if (!c.ok && !o.signal?.aborted) {
      messages.push({ role: "user", content: repairTask(c.errors) });
      await designer(messages, REPAIR_STEPS);
      c = await compile(ws.files, facts, o.signal);
    }
    if (!c.ok) {
      // The film must still play: everything goes back to how it was.
      const back = { ...before, spend: { ...ledger }, log: [...film.log, log(`the edit did not pass the check (${c.errors.slice(0, 2).join("; ")}); the film is back as it was`, "error")].slice(-MAX_LOG) };
      o.update(back);
      act(null);
      return { film: back, plan, refused: applied.refused, changed: { code: false, voice: 0, music: false } };
    }
    film = { ...film, files: { ...ws.files }, modules: c.modules, summary: r.summary };
  } else if (!o.signal?.aborted) {
    // Nothing in the code changed: the compiled scene still fits (its cues were checked above).
    film = { ...film, modules: before.modules };
  }
  act(null);
  film = { ...film, spend: { ...ledger }, status: o.signal?.aborted ? "stopped" : "done" };
  o.update(film);
  return { film, plan, refused: applied.refused, changed: { code, voice: voiced, music: applied.music } };
}
