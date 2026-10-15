/**
 * Briefs: a few kinds of video, the looks to pick from, and how a short
 * idea becomes a full creative brief. The person gives the idea and a few
 * choices; their model writes the brief from the website's own words
 * (writerPrompt). basicBrief is the plain version used without a key.
 * Pure: the wizard, the Studio and "Improve with AI" all build on it.
 */

import { DIRECTIONS, EXPLAINER_STYLES } from "@/bespoke/agent/styles";

/** The site a video is about when the person names none. */
export const DEFAULT_SITE = "oneapi.id";

export type TemplateId = "launch" | "feature" | "tutorial" | "switch" | "announcement" | "custom";

export type Template = {
  id: TemplateId;
  label: string;
  hint: string;
  /** What it is called in the brief: "launch film". */
  noun: string;
  goal: string;
  /** What the first seconds show when there is no offer to open on. */
  hook: string;
  /** What the idea box suggests for this kind. */
  ideaPlaceholder: string;
  seconds: number;
};

export const TEMPLATES: Template[] = [
  {
    id: "launch",
    label: "Launch promo",
    hint: "Introduce the product: what it is, why it matters, try it now.",
    noun: "launch film",
    goal: "make the audience want to try it today",
    hook: "the problem the product removes",
    ideaPlaceholder: "e.g. Introducing the product; one API for many models",
    seconds: 30,
  },
  {
    id: "feature",
    label: "New feature or model",
    hint: "Something new is available: show it, say why it matters.",
    noun: "announcement of something new",
    goal: "make users try the new thing",
    hook: "the new thing itself",
    ideaPlaceholder: "e.g. A new model is now available",
    seconds: 20,
  },
  {
    id: "tutorial",
    label: "How-to",
    hint: "Teach one thing in a few steps, with real code or UI.",
    noun: "how-to film",
    goal: "teach it clearly enough to follow along",
    hook: "the result the viewer will get",
    ideaPlaceholder: "e.g. Call any model from Python in 3 steps",
    seconds: 30,
  },
  {
    id: "switch",
    label: "Why switch",
    hint: "The old way hurts; show the way out, before and after.",
    noun: '"why switch" film',
    goal: "make the audience feel the old way's pain and see the way out",
    hook: "the pain of the old way, shown concretely",
    ideaPlaceholder: "e.g. One key instead of five providers",
    seconds: 30,
  },
  {
    id: "announcement",
    label: "Announcement",
    hint: "News, an offer or an event: make sure nobody misses it.",
    noun: "announcement",
    goal: "make sure nobody misses it",
    hook: "the news",
    ideaPlaceholder: "e.g. Pay $2, get $10 of usage this week",
    seconds: 15,
  },
  {
    id: "custom",
    label: "Custom",
    hint: "Your own kind of video: say what it is and what it should do.",
    noun: "film",
    goal: "do what the idea says it is for",
    hook: "the most striking thing in the idea",
    ideaPlaceholder: "e.g. A recruiting film for backend engineers",
    seconds: 30,
  },
];

export const templateOf = (id: TemplateId): Template => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export type Look = { id: string; label: string; group: "auto" | "promo" | "explainer"; hint: string; brief: string };

/** The looks to pick from: the art director's choice, the style directions, the explainer styles. */
export const LOOKS: Look[] = [
  { id: "auto", label: "Art director's choice", group: "auto", hint: "Picked from the brand and the product.", brief: "the art director's choice from the style directions, fitted to the brand" },
  ...DIRECTIONS.map((d): Look => ({ id: slug(d.name), label: d.name, group: "promo", hint: `${d.background}. Good for ${d.for}.`, brief: `the "${d.name}" style direction (${d.background}; ${d.type}; ${d.motion})` })),
  ...EXPLAINER_STYLES.map((d): Look => ({ id: slug(d.name), label: d.name, group: "explainer", hint: `${d.look}. Good for ${d.for}.`, brief: `the "${d.name}" explainer style (${d.look})` })),
];

export const LANGUAGES = ["Bahasa Indonesia", "English"] as const;
export const LENGTHS = [15, 20, 30, 45] as const;

/** What the person decides; the brief writer finds everything else on the website. */
export type BriefIdea = {
  template: TemplateId;
  /** In their own words: what the video is about, an offer, anything that must be in it. May be empty, or a whole rough brief. */
  idea: string;
  website: string;
  seconds: number;
  language: string;
  look: string;
  voice: boolean;
};

export const defaultIdea = (template: TemplateId = "launch", website = ""): BriefIdea => ({ template, idea: "", website, seconds: templateOf(template).seconds, language: LANGUAGES[0], look: "auto", voice: false });

/** The site a brief is about: the one given, else OneAPI's. */
export const siteOf = (website: string) => website.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "") || DEFAULT_SITE;

const lookOf = (id: string) => LOOKS.find((l) => l.id === id) ?? LOOKS[0];

/** The rules every brief ends with, whoever wrote it. */
const factRules = (site: string) =>
  `Only state facts from ${site} or this brief: names, features, supported APIs, models, prices and offers exactly as written. No fake clients, partnerships, statistics, testimonials, benchmarks, savings or features. Show every brand, tool or model the film uses with its real logo; a competitor named only to compare appears as text, without its logo.`;

/** A plain brief built without a model: used when there is no key, and when the person writes nothing. */
export function basicBrief(i: BriefIdea): string {
  const t = templateOf(i.template);
  const site = siteOf(i.website);
  const name = site === DEFAULT_SITE ? "OneAPI (oneapi.id)" : site;
  return [
    `Create a ${i.seconds}-second ${t.noun} for ${name}.`,
    i.idea.trim() ? `The idea: ${i.idea.trim()}` : "",
    `Read ${site} for what it is, its features, supported APIs, models, prices and offers, its logo and colours, and use them as they are.`,
    `Goal: ${t.goal}. Open within the first 2 seconds on ${t.hook}, or on the offer when there is one.`,
    `Look: ${lookOf(i.look).brief}. Use the real logo and product interface; no invented mascot.`,
    i.voice ? `Voice-over in ${i.language}.` : "No voice-over: music, sound design and on-screen text carry it.",
    `Every word on screen in ${i.language}, very little at once. End on the logo, the name and ${site}.`,
    factRules(site),
  ]
    .filter(Boolean)
    .join("\n");
}

/** The brief used when the person writes none: a launch film for the website, or for OneAPI. */
export const defaultBrief = (website: string) => basicBrief(defaultIdea("launch", website));

export type SiteText = { url: string; title: string; description: string; text: string };

/**
 * What the person's model is asked, to write a full creative brief: the
 * shape of a senior creative director's brief (positioning, capabilities,
 * the story line, a timed storyboard with on-screen text, motifs, what to
 * avoid, sound, the close, the deliverable), filled only with the
 * website's facts and the person's idea. No example is given: a model
 * copies examples.
 */
export function writerPrompt(i: BriefIdea, site: SiteText | null, format: string): { system: string; user: string } {
  const t = templateOf(i.template);
  const look = lookOf(i.look);
  const host = siteOf(i.website);
  return {
    system: `You are the creative director of a motion studio that makes premium launch films for technical products. Write the brief a motion designer will build one short film from: specific, visual, opinionated, technical where the product is technical, never generic.

FACTS: use only what the WEBSITE and the person's IDEA say about the product: its name, positioning, features, supported APIs, models, prices and offers, copied exactly. Never invent features, models, clients, partnerships, statistics, testimonials, benchmarks or savings; what the sources do not state is left out or shown as a clearly visual metaphor of how the product works. An offer or price in the IDEA appears on screen exactly as written, early. A competitor named only to compare appears as text, without its logo.

Write the brief in English, with every on-screen text quoted in ${i.language}. Plain text with short headings, no tables, under 900 words. Cover, in this order:
1. One opening paragraph: what to create (a ${i.seconds}-second ${t.noun} for the product), in which visual style, and the feeling it must leave.
2. Brand: use the real logo, colours and product interface from the website; no invented mascot or fake assets. Name the brand colours if the website shows them.
3. Focus: what the product is in one line, then 2 to 4 capabilities to show, each one line, from the website.
4. The story: one core line of three short beats (in ${i.language}), then the journey in 3 to 5 sentences: the problem, the turn, what changes for the viewer. Goal: ${t.goal}.
5. Visual style: ${look.brief}; the canvas, the camera language, how rough sketches or abstract shapes and real polished UI mix, the colours; very little text at once.
6. Storyboard: 4 to 6 timed sections covering 0 to ${i.seconds} seconds. For each: the seconds, what happens on screen in 2 to 4 concrete sentences (camera moves, transitions, what transforms into what), and the on-screen text in quotes, at most 6 words. The first 2 seconds show ${t.hook} or the offer.
7. Visual motifs: 8 to 14 concrete things to show that fit this product (UI, code, data, objects), as a list.
8. Avoid: the clichés that do not fit this product, as a short list.
9. Sound design: specific cues tied to the picture (strokes, clicks, impacts, transitions) and how the music builds. ${i.voice ? `A voice-over in ${i.language}.` : "No voice-over."}
10. The close: the logo, the name, one line and the address ${host}.
11. Deliverable: ${format}, 30 fps, ${i.seconds} seconds at most.

Reply with the brief only.`,
    user: [
      `KIND: ${t.label} (${t.hint})`,
      `IDEA (the person's own words; keep every fact and number exactly): ${i.idea.trim() || "(none: a film that introduces the product)"}`,
      `WEBSITE: ${host}`,
      site ? `PAGE: "${site.title}". ${site.description}\nTEXT: ${site.text.slice(0, 8000)}` : "(the website could not be read: use only the idea)",
    ].join("\n\n"),
  };
}

/** The model's brief, without a fence or a preamble around it, at a length the agents can carry. */
export function cleanBrief(text: string): string {
  const fenced = /```(?:\w+)?\s*([\s\S]*?)```/.exec(text);
  const body = (fenced ? fenced[1] : text).trim();
  return body.length > 12_000 ? `${body.slice(0, 12_000).trimEnd()}\n…` : body;
}

/** The deliverable line for a video size. */
export const formatLine = (format: string) => (format === "portrait" ? "9:16, 1080 x 1920" : format === "square" ? "1:1, 1080 x 1080" : "16:9, 1920 x 1080");

/**
 * A rough brief read as an idea for the writer: its length ("30 detik",
 * "45 seconds"), whether it wants a voice-over, and English when it asks for
 * it (Bahasa Indonesia otherwise). The brief itself is the idea.
 */
export function ideaFromBrief(brief: string, website: string): BriefIdea {
  const s = /(\d{1,2})\s*(?:-|\s)?(?:s\b|sec|secs|second|seconds|detik|dtk)/i.exec(brief);
  const seconds = s ? Math.min(60, Math.max(10, Number(s[1]))) : 30;
  const noVoice = /(tanpa|no|without|tidak pakai|gak pakai|ga pakai)\s+(voice[\s-]?over|narasi|narration|vo\b)|voice[\s-]?over is not required|no voice/i.test(brief);
  const voice = !noVoice && /(voice[\s-]?over|narasi|narration|narrator)/i.test(brief);
  const english = /\b(in english|english (only|text|voice)|bahasa inggris)\b/i.test(brief) || (!/\b(dan|yang|untuk|dengan|bikin|buat|tanpa|bahasa indonesia)\b/i.test(brief) && /\b(the|and|with|for)\b/i.test(brief));
  return { ...defaultIdea("custom", website), idea: brief.trim(), seconds, voice, language: english ? "English" : "Bahasa Indonesia" };
}
