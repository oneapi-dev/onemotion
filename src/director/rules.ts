import type { Archetype, CameraPath, LookName, Music, Plan, PlanItem, PlanScene, SceneType, Tone } from "@/engine/plan";
import type { DirectInput } from "./input";
import { clipRunes, firstNonEmpty, fitText, normalizeHex, words } from "./text";
import { aboutPlatform, squash } from "./facts";

/**
 * The rules every plan is held to before it is drawn: known values only,
 * text clipped to what the cards can hold, scenes without what they need
 * dropped, one closing call to action, and durations fitted to reading time
 * and to the length the brief asks for. Also run on plans a person edits.
 */

export const TONES: Tone[] = ["punchy", "polished", "cinematic", "playful", "deadpan", "energetic", "clean"];
export const ARCHETYPES: Archetype[] = ["promo", "launch", "announcement", "explainer", "tutorial", "problem-solution", "versus", "reasons", "one-number"];
export const MUSIC: Music[] = ["drive", "bright", "calm", "pulse", "epic"];
export const LOOKS: LookName[] = ["midnight", "graphite", "paper", "sage", "mono", "ember"];
export const PATHS: CameraPath[] = ["dolly", "serpentine", "staircase"];

export const DISPLAY_FONTS = [
  "Inter", "Inter Tight", "Plus Jakarta Sans", "DM Sans", "Space Grotesk", "Poppins", "Montserrat",
  "Bricolage Grotesque", "Geist", "Manrope", "Outfit", "Syne", "Sora", "Archivo",
  "Lora", "Playfair Display", "Fraunces", "Instrument Serif",
];
export const BODY_FONTS = ["Inter", "Plus Jakarta Sans", "DM Sans", "Geist", "Manrope", "Outfit", "Poppins", "Montserrat", "Lora"];

type Spec = {
  eyebrow?: number;
  title?: number;
  body?: number;
  value?: number;
  left?: number;
  right?: number;
  titleRequired?: boolean;
  bodyRequired?: boolean;
  valueRequired?: boolean;
  shotRequired?: boolean;
  itemsMin?: number;
  itemsMax?: number;
  itemTitle?: number;
  itemBody?: number;
  itemBodyRequired?: boolean;
  minSeconds: number;
};

export const CODE_MAX_RUNES = 360;
export const CODE_MAX_LINES = 8;
export const CODE_LINE_MAX = 46;

/** Which fields each scene type uses, and their limits. */
export const SPECS: Record<SceneType, Spec> = {
  hook: { title: 60, body: 80, titleRequired: true, minSeconds: 2.2 },
  logo: { title: 60, minSeconds: 2.2 },
  statement: { title: 70, titleRequired: true, minSeconds: 2.2 },
  screenshot: { title: 60, shotRequired: true, minSeconds: 3 },
  device: { title: 50, body: 90, titleRequired: true, shotRequired: true, minSeconds: 3 },
  features: { title: 40, itemsMin: 2, itemsMax: 4, itemTitle: 28, itemBody: 64, minSeconds: 3.5 },
  steps: { title: 40, itemsMin: 3, itemsMax: 3, itemTitle: 28, itemBody: 50, minSeconds: 3.5 },
  converge: { title: 50, itemsMin: 3, itemsMax: 6, itemTitle: 18, minSeconds: 3.5 },
  stat: { title: 40, body: 60, value: 12, titleRequired: true, valueRequired: true, minSeconds: 2.5 },
  quote: { title: 40, body: 160, bodyRequired: true, minSeconds: 3.5 },
  offer: { eyebrow: 24, title: 40, body: 60, value: 12, titleRequired: true, valueRequired: true, minSeconds: 3 },
  cta: { title: 24, body: 60, titleRequired: true, minSeconds: 3 },
  announce: { eyebrow: 22, title: 32, body: 90, titleRequired: true, itemsMax: 3, itemTitle: 20, minSeconds: 3 },
  chat: { title: 40, itemsMin: 2, itemsMax: 4, itemTitle: 4, itemBody: 110, itemBodyRequired: true, minSeconds: 4 },
  code: { eyebrow: 28, title: 50, body: CODE_MAX_RUNES, bodyRequired: true, minSeconds: 4 },
  checklist: { title: 40, itemsMin: 2, itemsMax: 5, itemTitle: 40, minSeconds: 3.5 },
  bars: { title: 44, body: 80, itemsMin: 2, itemsMax: 5, itemTitle: 18, itemBody: 12, itemBodyRequired: true, minSeconds: 4 },
  compare: { title: 44, left: 20, right: 20, itemsMin: 2, itemsMax: 4, itemTitle: 30, itemBody: 30, itemBodyRequired: true, minSeconds: 4.5 },
  kinetic: { itemsMin: 2, itemsMax: 6, itemTitle: 18, minSeconds: 2.4 },
  specs: { title: 44, itemsMin: 2, itemsMax: 6, itemTitle: 20, itemBody: 18, itemBodyRequired: true, minSeconds: 3.5 },
};

export const MIN_TOTAL = 10;
export const MAX_TOTAL = 40;
export const HARD_MAX = 45;
const HARD_SLACK = 5;
export const MAX_SCENE = 7;
export const MIN_SCENES = 3;
export const MAX_SCENES = 10;
/** Longest voiceover line for one scene, in characters. */
export const NARRATION_MAX = 220;

/** Which scene types go first when a video runs long. */
const DROP_ORDER: SceneType[] = ["statement", "quote", "kinetic", "steps", "features", "checklist", "stat", "converge", "logo", "specs", "bars", "compare", "chat", "code", "offer"];

export class UnusablePlanError extends Error {
  constructor(message: string) {
    super(`The model's answer could not be used: ${message}`);
    this.name = "UnusablePlanError";
  }
}

const has = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** v, or when it equals prev, another member of list. */
export function differ<T extends string>(list: readonly T[], v: T, prev: string | undefined, seed: number): T {
  if (!prev || v !== prev) return v;
  for (let i = 1; i < list.length; i++) {
    const next = list[(list.indexOf(v) + i + seed) % list.length];
    if (next !== prev) return next;
  }
  return v;
}

function pickFont(allowed: string[], choice: string | undefined, site: string | undefined, fallback: string): string {
  for (const cand of [choice, site]) {
    const hit = allowed.find((f) => f.toLowerCase() === (cand ?? "").trim().toLowerCase());
    if (hit) return hit;
  }
  return fallback;
}

/** Maps whatever the model called a speaker to user or ai. */
export function chatRole(v: string | undefined, i: number): "user" | "ai" {
  const s = (v ?? "").trim().toLowerCase();
  if (["user", "you", "me", "human", "customer", "dev", "developer"].includes(s)) return "user";
  if (["ai", "assistant", "bot", "model", "agent"].includes(s)) return "ai";
  return i % 2 === 0 ? "user" : "ai";
}

/** Keeps a snippet's line breaks and indentation, capping lines, width and size. */
export function fitCode(s: string | undefined): string {
  const lines = (s ?? "").replaceAll("\r\n", "\n").replaceAll("\t", "  ").replace(/^\n+|\n+$/g, "").split("\n");
  const out: string[] = [];
  let total = 0;
  for (let l of lines) {
    l = clipRunes(l.replace(/ +$/, ""), CODE_LINE_MAX);
    if (out.length === CODE_MAX_LINES || total + [...l].length + 1 > CODE_MAX_RUNES) break;
    out.push(l);
    total += [...l].length + 1;
  }
  return out.join("\n").replace(/[\n ]+$/, "");
}

const STEP_NUMBER = /^\s*(?:(?:step|langkah)\s*)?\d+\s*[.):-]\s*/i;

function normalizeScene(raw: PlanScene, shots: number): PlanScene | null {
  const spec = SPECS[raw.type];
  if (!spec) return null;
  const field = (v: string | undefined, max?: number) => (max ? fitText(v, max) : "");
  const s: PlanScene = { type: raw.type, duration: Number(raw.duration) || 0 };
  const eyebrow = field(raw.eyebrow, spec.eyebrow);
  const title = field(raw.title, spec.title);
  const body = raw.type === "code" ? fitCode(raw.body) : field(raw.body, spec.body);
  const value = field(raw.value, spec.value);
  let left = field(raw.left, spec.left);
  let right = field(raw.right, spec.right);
  if ((spec.titleRequired && !title) || (spec.bodyRequired && !body) || (spec.valueRequired && !value)) return null;
  if (raw.type === "compare") {
    left ||= "Before";
    right ||= "After";
  }
  if (eyebrow) s.eyebrow = eyebrow;
  if (title) s.title = title;
  if (body) s.body = body;
  if (value) s.value = value;
  if (left) s.left = left;
  if (right) s.right = right;
  const narration = typeof raw.narration === "string" ? fitText(raw.narration, NARRATION_MAX) : "";
  if (narration) {
    s.narration = narration;
    const measured = Number(raw.narration_seconds);
    if (Number.isFinite(measured) && measured > 0 && measured <= 30) s.narration_seconds = Math.round(measured * 100) / 100;
  }
  if (spec.shotRequired) {
    if (typeof raw.shot !== "number" || raw.shot < 0 || raw.shot >= shots) return null;
    s.shot = raw.shot;
    s.motion = raw.motion === "scroll" || raw.motion === "pan" ? raw.motion : "zoom";
  }
  if (spec.itemsMax) {
    const items: PlanItem[] = [];
    (Array.isArray(raw.items) ? raw.items : []).forEach((it, i) => {
      let t = raw.type === "chat" ? chatRole(it?.title, i) : it?.title;
      if (raw.type === "steps") t = (t ?? "").replace(STEP_NUMBER, "");
      const item: PlanItem = { title: fitText(t, spec.itemTitle ?? 0) };
      const b = field(it?.body, spec.itemBody);
      if (b) item.body = b;
      if (raw.type === "bars" && it?.highlight) item.highlight = true;
      if (!item.title || (spec.itemBodyRequired && !item.body)) return;
      if (items.length < spec.itemsMax!) items.push(item);
    });
    if (items.length < (spec.itemsMin ?? 0)) return null;
    if (raw.type === "bars" && !items.some((it) => it.highlight)) items[0].highlight = true;
    if (items.length) s.items = items;
  }
  return s;
}

function wordCount(s: PlanScene): number {
  let n = words(s.eyebrow) + words(s.title) + words(s.body) + words(s.value) + words(s.left) + words(s.right);
  for (const it of s.items ?? []) n += words(it.title) + words(it.body);
  return n;
}

/** The time a scene's words need, within the per-scene cap. */
export function minSeconds(s: PlanScene): number {
  let need: number;
  switch (s.type) {
    case "code":
      need = 2.2 + 0.45 * ((s.body ?? "").split("\n").length) + 0.3 * words(s.title);
      break;
    case "kinetic":
      need = 0.8 + 0.55 * (s.items?.length ?? 0);
      break;
    case "chat":
      need = 1.2 + 0.3 * words(s.title);
      for (const it of s.items ?? []) need += 0.7 + 0.18 * words(it.body);
      break;
    default:
      need = 1 + 0.3 * wordCount(s);
  }
  // A scene holds while its line is spoken: the recorded length once known,
  // else about 2.4 words a second plus a breath.
  if (s.narration) need = Math.max(need, s.narration_seconds ? s.narration_seconds + 0.8 : 0.8 + words(s.narration) / 2.4);
  return Math.min(Math.max(SPECS[s.type].minSeconds, need), MAX_SCENE);
}

const LENGTH = /\b(\d{1,2})\s*(?:-|to|sampai|hingga)?\s*(\d{1,2})?\s*(?:detik|dtk|seconds?|secs?|s)\b/i;

/**
 * How long a video should run: what the brief asks for ("30 detik",
 * "15-20 seconds"), else 12 to 25 seconds, with room to 40 for explainers
 * and tutorials.
 */
export function lengthWindow(prompt: string, archetype: string): [number, number] {
  const m = LENGTH.exec(prompt);
  if (m) {
    let a = Number(m[1]);
    let b = m[2] ? Number(m[2]) : a;
    if (a > b) [a, b] = [b, a];
    const lo = Math.max(MIN_TOTAL, a - 2);
    const hi = Math.min(MAX_TOTAL, b + 2);
    if (lo < hi) return [lo, hi];
  }
  if (archetype === "explainer" || archetype === "tutorial") return [15, MAX_TOTAL];
  return [12, 25];
}

function trimToLength(scenes: PlanScene[], hard: number): PlanScene[] {
  const total = () => scenes.reduce((t, s) => t + minSeconds(s), 0);
  while (total() > hard && scenes.length > MIN_SCENES) {
    let dropped = false;
    for (const type of DROP_ORDER) {
      for (let i = scenes.length - 2; i >= 1; i--) {
        if (scenes[i].type === type) {
          scenes.splice(i, 1);
          dropped = true;
          break;
        }
      }
      if (dropped) break;
    }
    if (!dropped) break;
  }
  return scenes;
}

/** Each scene gets at least its reading time; the whole fits the window. */
function fitDurations(scenes: PlanScene[], lo: number, hi: number) {
  const mins = scenes.map(minSeconds);
  let total = 0;
  scenes.forEach((s, i) => {
    let d = s.duration;
    if (!Number.isFinite(d) || d < mins[i]) d = mins[i];
    s.duration = Math.min(d, MAX_SCENE);
    total += s.duration;
  });
  if (total > hi) {
    const slack = scenes.reduce((a, s, i) => a + s.duration - mins[i], 0);
    if (slack > 0) {
      const k = Math.min(1, (total - hi) / slack);
      scenes.forEach((s, i) => (s.duration -= (s.duration - mins[i]) * k));
    }
    // Still long: read a little faster, never more than a fifth under.
    const left = scenes.reduce((a, s) => a + s.duration, 0);
    if (left > hi) {
      const k = Math.max(0.8, hi / left);
      scenes.forEach((s) => (s.duration *= k));
    }
  } else if (total < lo) {
    const k = lo / total;
    scenes.forEach((s) => (s.duration = Math.min(MAX_SCENE, s.duration * k)));
  }
  scenes.forEach((s) => (s.duration = Math.round(s.duration * 10) / 10));
}

/** Drops converge items naming the brand itself: the brand is the hub. */
function withoutBrand(items: PlanItem[] | undefined, name: string, domain: string): PlanItem[] | undefined {
  if (!items) return items;
  const n = name.toLowerCase();
  const d = domain.toLowerCase();
  return items.filter((it) => {
    const t = (it.title ?? "").trim().toLowerCase();
    return !(t && (t === n || t === d || n.startsWith(`${t} `)));
  });
}

/** A two-letter language code: the plan's own, else the website's, else English. */
function languageOf(...candidates: (string | undefined)[]): string {
  for (const c of candidates) {
    const m = /^([a-z]{2})(?:[-_]|$)/i.exec((c ?? "").trim());
    if (m) return m[1].toLowerCase();
  }
  return "en";
}

/**
 * Makes any plan safe to draw. Throws UnusablePlanError when too little of
 * it survives.
 */
export function normalizePlan(raw: Partial<Plan> & { scenes?: PlanScene[] }, input: DirectInput): Plan {
  const seed = input.variation ?? 0;
  const p = {} as Plan;
  p.angle = fitText(raw.angle, 200);
  p.caption = fitText(raw.caption, 220);
  p.language = languageOf(raw.language, input.site?.lang);
  p.brand = fitText(raw.brand, 32);
  if (aboutPlatform(input) && squash(p.brand) === "oneapi") p.brand = "OneAPI";
  p.brand ||= fitText(input.site?.name, 32);
  p.archetype = has(ARCHETYPES, raw.archetype) ? raw.archetype : "promo";
  p.look = has(LOOKS, raw.look) ? raw.look : "graphite";
  p.path = has(PATHS, raw.path) ? raw.path : "dolly";
  p.tone = has(TONES, input.tone) ? input.tone : has(TONES, raw.tone) ? raw.tone : "punchy";
  p.music = has(MUSIC, raw.music)
    ? raw.music
    : (({ polished: "calm", deadpan: "calm", energetic: "pulse", cinematic: "epic", playful: "bright", clean: "bright" } as Record<string, Music>)[p.tone] ?? "drive");

  // A new take never wears the previous take's look, route or music; a new
  // video not those of the person's last one.
  const prev = input.previous;
  const last = !prev ? input.recent?.[0] : undefined;
  const avoid = prev ?? last;
  if (avoid) {
    p.look = differ(LOOKS, p.look, avoid.look, seed);
    p.path = differ(PATHS, p.path, avoid.path, Math.floor(seed / 7));
    p.music = differ(MUSIC, p.music, avoid.music, Math.floor(seed / 3));
  }
  p.fonts = {
    display: pickFont(DISPLAY_FONTS, raw.fonts?.display, input.site?.fonts?.display, "Inter Tight"),
    body: pickFont(BODY_FONTS, raw.fonts?.body, input.site?.fonts?.body, "Inter"),
  };
  // Only the website's own color: a guess would fight the look.
  const brandColor = normalizeHex(input.site?.accent);
  if (brandColor) p.brand_color = brandColor;
  else if (raw.brand_color && input.keepBrandColor) p.brand_color = normalizeHex(raw.brand_color) || undefined;

  const shots = input.shots?.length ?? 0;
  let scenes: PlanScene[] = [];
  for (const s of Array.isArray(raw.scenes) ? raw.scenes : []) {
    if (!s || typeof s !== "object") continue;
    const scene = s.type === "converge" ? { ...s, items: withoutBrand(s.items, firstNonEmpty(input.site?.name, p.brand), input.site?.domain ?? "") } : s;
    const n = normalizeScene(scene, shots);
    if (n) scenes.push(n);
  }
  const body = scenes.filter((s) => s.type !== "cta").slice(0, MAX_SCENES - 1);
  const closers = scenes.filter((s) => s.type === "cta");
  const cta = closers[closers.length - 1] ?? { type: "cta" as const, duration: 3, title: fitText(firstNonEmpty(input.site?.domain, p.brand), 24) || "Learn more" };
  scenes = [...body, cta];
  if (scenes.length < MIN_SCENES) throw new UnusablePlanError(`only ${scenes.length} usable scenes`);
  const [lo, hi] = lengthWindow(input.prompt ?? "", p.archetype);
  scenes = trimToLength(scenes, Math.min(HARD_MAX, hi + HARD_SLACK));
  fitDurations(scenes, lo, hi);
  p.scenes = scenes;
  return p;
}
