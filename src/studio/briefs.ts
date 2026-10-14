/**
 * The brief wizard's knowledge: a few kinds of video, what each needs to
 * be good, and how answers become a brief the art director can work from.
 * Pure: the wizard UI and the Studio's default brief both build on it.
 */

/** The site a video is about when the person names none. */
export const DEFAULT_SITE = "oneapi.id";

export type TemplateId = "launch" | "feature" | "tutorial" | "switch" | "announcement";

export type Template = {
  id: TemplateId;
  label: string;
  hint: string;
  /** "A 20-second launch promo" */
  title: (seconds: number) => string;
  goal: string;
  /** The story the film should tell, beat by beat. */
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
    title: (s) => `A ${s}-second launch promo`,
    goal: "make the audience want to try it today",
    story: "a hook in the first 2 seconds (the promise or the problem) → what it is → the key points, each shown in action, not listed → the brand, its address and the call to action",
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
    title: (s) => `A ${s}-second announcement of something new`,
    goal: "make users try the new thing",
    story: "open on the new thing itself → what it does, shown in use → why it matters → where to get it",
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
    title: (s) => `A ${s}-second how-to`,
    goal: "teach it clearly enough to follow along",
    story: "the goal in one line → each step shown with its real code or UI, one at a time → the result working → where to start",
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
    title: (s) => `A ${s}-second "why switch" film`,
    goal: "make the audience feel the old way's pain and see the way out",
    story: "the pain, shown concretely → the turn: the product → each improvement as a before and after → the call to action",
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
    title: (s) => `A ${s}-second announcement`,
    goal: "make sure nobody misses it",
    story: "the news in the first second → the details, one at a time → when and where",
    subjectLabel: "The news",
    subjectPlaceholder: "e.g. A weekend offer on every model",
    pointsLabel: "Details: dates, terms, who it is for (up to 3)",
    pointsPlaceholder: ["e.g. From Friday to Sunday", "e.g. For new and existing accounts", "e.g. No code needed"],
    seconds: 15,
  },
];

export const templateOf = (id: TemplateId): Template => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

export const LOOKS = [
  { id: "auto", label: "Art director's choice", brief: "the art director's choice, fitted to the brand" },
  { id: "bold", label: "Bold and kinetic", brief: "bold and kinetic: big type, confident moves on the beat" },
  { id: "premium", label: "Premium and calm", brief: "premium and calm: generous space, slow precise moves, restrained colour" },
  { id: "sketch", label: "Hand-drawn", brief: "hand-drawn: marker strokes, arrows and sketches drawing themselves on paper" },
  { id: "technical", label: "Technical", brief: "technical: diagrams, real code and data, precise and clean" },
  { id: "playful", label: "Playful", brief: "playful: bouncy shapes, bright colour, a light touch" },
] as const;
export type LookId = (typeof LOOKS)[number]["id"];

export const AUDIENCES = ["Developers", "Startups and product teams", "Business owners", "Everyone"] as const;
export const LANGUAGES = ["Bahasa Indonesia", "English"] as const;
export const LENGTHS = [15, 20, 30, 45] as const;

export type BriefAnswers = {
  template: TemplateId;
  website: string;
  product: string;
  about: string;
  subject: string;
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
  return { template, website, product: "", about: "", subject: "", points: ["", "", ""], audience: AUDIENCES[0], cta: "", seconds: t.seconds, language: LANGUAGES[0], look: "auto", voice: true };
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
  return [
    `${t.title(a.seconds)} for ${name ? `${name} (${site})` : site}.`,
    a.about.trim() ? `What it is: ${a.about.trim()}` : `What it is: read it from ${site}, in its own words (what it does, its features, its prices).`,
    `Goal: ${t.goal}.`,
    `Audience: ${a.audience.trim() || AUDIENCES[0]}.`,
    a.subject.trim() ? `${t.subjectLabel}: ${a.subject.trim()}` : "",
    points.length ? `${t.pointsLabel.replace(/ \(up to 3\)$/, "")}:\n${points.map((p) => `- ${p}`).join("\n")}` : "",
    `Story: ${t.story}.`,
    `Call to action: ${a.cta.trim() || `try it at ${site}`}.`,
    `Look: ${look.brief}.`,
    a.voice ? `Voice-over: yes, in ${a.language}.` : "No voice-over: music, sound design and on-screen text carry it.",
    `Language of every word on screen${a.voice ? " and in the voice" : ""}: ${a.language}.`,
    `Only state facts from ${site} or this brief. Show every brand, tool or model with its real logo.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** The brief used when the person writes none: a launch promo for the site, or for OneAPI. */
export const defaultBrief = (website: string) => buildBrief(defaultAnswers("launch", website));
