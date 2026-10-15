/**
 * The brief wizard's knowledge: a few kinds of video, what each needs to
 * be good, and how answers become a brief the art director can work from.
 * Pure: the wizard UI and the Studio's default brief both build on it.
 */

import { DIRECTIONS, EXPLAINER_STYLES } from "@/bespoke/agent/styles";

/** The site a video is about when the person names none. */
export const DEFAULT_SITE = "oneapi.id";

export type TemplateId = "launch" | "feature" | "tutorial" | "switch" | "announcement" | "custom";

export type Template = {
  id: TemplateId;
  label: string;
  hint: string;
  /** What it is called in the brief: "launch promo". */
  noun: string;
  goal: string;
  /** What the first 2 seconds show when there is no offer to open on. */
  hook: string;
  /** The story after the hook, beat by beat. */
  story: string;
  subjectLabel: string;
  subjectPlaceholder: string;
  pointsLabel: string;
  pointsPlaceholder: string[];
  seconds: number;
};

export const TEMPLATES: Template[] = [
  {
    id: "launch",
    label: "Launch promo",
    hint: "Introduce the product: what it is, why it matters, try it now.",
    noun: "launch promo",
    goal: "make the audience want to try it today",
    hook: "the promise or the problem",
    story: "what it is → the key points, each shown in action, not listed → the brand, its address and the call to action",
    subjectLabel: "The main promise",
    subjectPlaceholder: "e.g. One API key for every AI model",
    pointsLabel: "What makes it worth trying (up to 3)",
    pointsPlaceholder: ["e.g. Every major model behind one endpoint", "e.g. Works with the OpenAI SDK you already use", "e.g. Pay only for what you use"],
    seconds: 20,
  },
  {
    id: "feature",
    label: "New feature or model",
    hint: "Something new is available: show it, say why it matters.",
    noun: "announcement of something new",
    goal: "make users try the new thing",
    hook: "the new thing itself",
    story: "what it does, shown in use → why it matters → where to get it",
    subjectLabel: "What is new",
    subjectPlaceholder: "e.g. MiMo V2.6 is now available",
    pointsLabel: "Why it matters (up to 3)",
    pointsPlaceholder: ["e.g. Faster answers for coding", "e.g. A bigger context window", "e.g. Available on every plan"],
    seconds: 15,
  },
  {
    id: "tutorial",
    label: "How-to",
    hint: "Teach one thing in a few steps, with real code or UI.",
    noun: "how-to",
    goal: "teach it clearly enough to follow along",
    hook: "the goal in one line",
    story: "each step shown with its real code or UI, one at a time → the result working → where to start",
    subjectLabel: "What the viewer will be able to do",
    subjectPlaceholder: "e.g. Call any model from Python",
    pointsLabel: "The steps, in order (up to 3)",
    pointsPlaceholder: ["e.g. Create an API key", "e.g. Set base_url to the API", "e.g. Pick a model and send a request"],
    seconds: 30,
  },
  {
    id: "switch",
    label: "Why switch",
    hint: "The old way hurts; show the way out, before and after.",
    noun: '"why switch" film',
    goal: "make the audience feel the old way's pain and see the way out",
    hook: "the pain, shown concretely",
    story: "the turn: the product → each improvement as a before and after → the call to action",
    subjectLabel: "The problem today",
    subjectPlaceholder: "e.g. A different key and SDK for every model provider",
    pointsLabel: "What gets better (up to 3)",
    pointsPlaceholder: ["e.g. One key instead of five", "e.g. One bill", "e.g. Switch models by changing one string"],
    seconds: 20,
  },
  {
    id: "announcement",
    label: "Announcement",
    hint: "News, an offer or an event: make sure nobody misses it.",
    noun: "announcement",
    goal: "make sure nobody misses it",
    hook: "the news",
    story: "the details, one at a time → when and where",
    subjectLabel: "The news",
    subjectPlaceholder: "e.g. A weekend offer on every model",
    pointsLabel: "Details: dates, terms, who it is for (up to 3)",
    pointsPlaceholder: ["e.g. From Friday to Sunday", "e.g. For new and existing accounts", "e.g. No code needed"],
    seconds: 15,
  },
  {
    id: "custom",
    label: "Custom",
    hint: "Your own kind of video: say what it is and what it should do.",
    noun: "film",
    goal: "do what the brief says it is for",
    hook: "the promise or the problem",
    story: "the message, shown rather than told → the close on the brand and the call to action",
    subjectLabel: "The main message",
    subjectPlaceholder: "e.g. Build your AI app in an afternoon",
    pointsLabel: "Key points (up to 3)",
    pointsPlaceholder: ["e.g. The first point", "e.g. The second point", "e.g. The third point"],
    seconds: 20,
  },
];

export const templateOf = (id: TemplateId): Template => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export type Look = { id: string; label: string; group: "auto" | "promo" | "explainer"; hint: string; brief: string };

/** The looks the wizard offers: the art director's choice, the style directions, the explainer styles. */
export const LOOKS: Look[] = [
  { id: "auto", label: "Art director's choice", group: "auto", hint: "Picked from the brand and the product.", brief: "the art director's choice from the style directions, fitted to the brand" },
  ...DIRECTIONS.map((d): Look => ({ id: slug(d.name), label: d.name, group: "promo", hint: `${d.background}. Good for ${d.for}.`, brief: `the "${d.name}" style direction (${d.background}; ${d.type}; ${d.motion})` })),
  ...EXPLAINER_STYLES.map((d): Look => ({ id: slug(d.name), label: d.name, group: "explainer", hint: `${d.look}. Good for ${d.for}.`, brief: `the "${d.name}" explainer style (${d.look})` })),
];
export type LookId = string;

export const AUDIENCES = ["Developers", "Startups and product teams", "Business owners", "Everyone"] as const;
export const LANGUAGES = ["Bahasa Indonesia", "English"] as const;
export const LENGTHS = [15, 20, 30, 45] as const;

export type BriefAnswers = {
  template: TemplateId;
  /** A custom video's kind ("a recruiting video for engineers") and what it is for. */
  kind: string;
  goal: string;
  website: string;
  product: string;
  about: string;
  subject: string;
  /** The offer or the number that hooks: "pay $2, get $10 of usage". It opens the film. */
  offer: string;
  points: string[];
  audience: string;
  cta: string;
  seconds: number;
  language: string;
  look: LookId;
  voice: boolean;
};

export function defaultAnswers(template: TemplateId, website = ""): BriefAnswers {
  const t = templateOf(template);
  return { template, kind: "", goal: "", website, product: "", about: "", subject: "", offer: "", points: ["", "", ""], audience: AUDIENCES[0], cta: "", seconds: t.seconds, language: LANGUAGES[0], look: "auto", voice: true };
}

/** The site an answer set is about: the one given, else OneAPI's. */
export const siteOf = (website: string) => website.trim().replace(/^https?:\/\//i, "").replace(/\/+$/, "") || DEFAULT_SITE;

/** The answers as a brief: what to make, about what, for whom, the story, the look and the rules of fact. */
export function buildBrief(a: BriefAnswers): string {
  const t = templateOf(a.template);
  const site = siteOf(a.website);
  const name = a.product.trim() || (site === DEFAULT_SITE ? "OneAPI" : "");
  const points = a.points.map((p) => p.trim()).filter(Boolean);
  const look = LOOKS.find((l) => l.id === a.look) ?? LOOKS[0];
  const offer = a.offer.trim();
  return [
    `A ${a.seconds}-second ${t.noun} for ${name ? `${name} (${site})` : site}.`,
    a.template === "custom" && a.kind.trim() ? `Kind of video: ${a.kind.trim()}` : "",
    a.about.trim() ? `What it is: ${a.about.trim()}` : `What it is: read it from ${site}, in its own words (what it does, its features, its prices).`,
    offer ? `The offer, which opens the film (show it exactly as written): ${offer}` : "",
    a.subject.trim() ? `${t.subjectLabel}: ${a.subject.trim()}` : "",
    points.length ? `${t.pointsLabel.replace(/ \(up to 3\)$/, "")} (each shown in use, not listed):\n${points.map((p) => `- ${p}`).join("\n")}` : "",
    `Audience: ${a.audience.trim() || AUDIENCES[0]}.`,
    `Goal: ${a.goal.trim().replace(/\.$/, "") || t.goal}.`,
    `Story: open within 2 seconds on ${offer ? "the offer" : t.hook} → ${t.story}.`,
    `Call to action: ${a.cta.trim() || `try it at ${site}`}.`,
    `Look: ${look.brief}.`,
    a.voice ? `Voice-over: yes, in ${a.language}.` : "No voice-over: music, sound design and on-screen text carry it.",
    `Language of every word on screen${a.voice ? " and in the voice" : ""}: ${a.language}.`,
    `Only state facts from ${site} or this brief, numbers and prices exactly as written. Show every brand, tool or model the film uses with its real logo; a competitor named only to compare appears as text, without its logo and without any claim this brief does not make.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The brief used when the person writes none: a launch promo for the site, or for OneAPI. */
export const defaultBrief = (website: string) => buildBrief(defaultAnswers("launch", website));

/** The inputs the AI may fill in from the website: everything about the message, nothing about the look. */
export type Suggestion = Pick<BriefAnswers, "product" | "about" | "subject" | "offer" | "points" | "cta" | "audience">;

/** What the model is asked, to write the message of a brief from the website's own words. */
export function suggestPrompt(a: BriefAnswers, site: { url: string; title: string; description: string; text: string }): { system: string; user: string } {
  const t = templateOf(a.template);
  return {
    system: `You write the inputs of a short video brief from a website. Use ONLY what the website says: never invent numbers, prices, features, clients or claims. Write in ${a.language}, short and concrete, like a good marketer: no hype words, no emoji. Return one JSON object only:
{"product": "the product's name", "about": "what it is, one sentence", "subject": "${t.subjectLabel}: one line", "offer": "an offer or promotion the website states (a price, a bonus, a free tier), copied exactly, or an empty string", "points": ["${t.pointsLabel.replace(/ \(up to 3\)$/, "")}: at most 3, each under 12 words"], "cta": "the call to action, with the site's address", "audience": "one of: ${AUDIENCES.join(", ")}"}`,
    user: [
      `VIDEO: a ${a.seconds}-second ${a.template === "custom" && a.kind.trim() ? a.kind.trim() : t.noun}${a.goal.trim() ? `; goal: ${a.goal.trim()}` : `; goal: ${t.goal}`}.`,
      a.product.trim() ? `PRODUCT: ${a.product.trim()}` : "",
      a.about.trim() ? `WHAT IT IS: ${a.about.trim()}` : "",
      a.subject.trim() ? `THE PERSON'S OWN ANGLE (keep it): ${a.subject.trim()}` : "",
      a.offer.trim() ? `THE PERSON'S OFFER (keep it): ${a.offer.trim()}` : "",
      `WEBSITE ${site.url}: "${site.title}". ${site.description}`,
      `TEXT: ${site.text.slice(0, 6000)}`,
    ]
      .filter(Boolean)
      .join("\n"),
  };
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/** A model's answer as wizard inputs: unknown fields dropped, lengths capped, exactly three point slots. */
export function readSuggestion(raw: unknown): Suggestion {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const points = (Array.isArray(o.points) ? o.points : []).map((p) => str(p, 140)).filter(Boolean).slice(0, 3);
  const audience = str(o.audience, 60);
  return {
    product: str(o.product, 60),
    about: str(o.about, 200),
    subject: str(o.subject, 140),
    offer: str(o.offer, 160),
    points: [...points, "", "", ""].slice(0, 3),
    cta: str(o.cta, 120),
    audience: (AUDIENCES as readonly string[]).includes(audience) ? audience : AUDIENCES[0],
  };
}

/** Fills the person's answers with a suggestion: what they typed themselves stays, the rest comes from the AI. */
export function applySuggestion(a: BriefAnswers, s: Suggestion): BriefAnswers {
  const keep = (mine: string, theirs: string) => (mine.trim() ? mine : theirs);
  return {
    ...a,
    product: keep(a.product, s.product),
    about: keep(a.about, s.about),
    subject: keep(a.subject, s.subject),
    offer: keep(a.offer, s.offer),
    points: a.points.map((p, i) => keep(p, s.points[i] ?? "")),
    cta: keep(a.cta, s.cta),
    audience: s.audience,
  };
}

/** What the model is asked, to turn a person's rough brief into the wizard's answers. The brief itself is then built by buildBrief. */
export function improvePrompt(brief: string, site: { url: string; title: string; description: string; text: string } | null): { system: string; user: string } {
  return {
    system: `You are a creative brief editor at a motion studio. A person wrote a rough brief for a short video. Sort what they wrote into the fields below so a creative director can work from it. Keep every fact, number, price, name and promise exactly as the person wrote it; take facts from the website only when the brief leaves a field empty; never invent numbers, prices, features, clients or claims. Write in the language of the brief. Return one JSON object only:
{"template": "one of: ${TEMPLATES.map((t) => t.id).join(", ")}", "kind": "for custom only: the kind of video in a few words", "product": "the product's name", "about": "what it is, one sentence", "offer": "the offer or promotion (prices, bonus, free tier), copied exactly, or an empty string", "subject": "the main message, one line", "points": ["at most 3 points, each under 12 words"], "audience": "one of: ${AUDIENCES.join(", ")}", "goal": "what the video should make the viewer do", "cta": "the call to action, with the site's address", "seconds": 20, "language": "the language of the on-screen text, e.g. Bahasa Indonesia", "look": "one of: ${LOOKS.map((l) => l.id).join(", ")}", "voice": false}
A look or length the brief names wins; otherwise "auto" and the length that fits (15 to 45 seconds). "voice" is true only when the brief asks for a voice-over or narration. An offer is never the goal: the goal is what the viewer does.`,
    user: [`BRIEF:\n${brief.trim() || "(empty: a launch promo for the website)"}`, site ? `WEBSITE ${site.url}: "${site.title}". ${site.description}\nTEXT: ${site.text.slice(0, 6000)}` : ""].filter(Boolean).join("\n\n"),
  };
}

/** A model's sorting of a brief, as wizard answers: unknown values fall back to the defaults. */
export function readImproved(raw: unknown, website: string): BriefAnswers {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const template = TEMPLATES.some((t) => t.id === o.template) ? (o.template as TemplateId) : "launch";
  const base = defaultAnswers(template, website);
  const s = readSuggestion(o);
  const seconds = typeof o.seconds === "number" && Number.isFinite(o.seconds) ? Math.round(Math.min(60, Math.max(10, o.seconds))) : base.seconds;
  return {
    ...base,
    ...s,
    kind: str(o.kind, 80),
    goal: str(o.goal, 160),
    seconds,
    language: str(o.language, 40) || base.language,
    look: LOOKS.some((l) => l.id === o.look) ? String(o.look) : "auto",
    voice: o.voice === true,
  };
}
