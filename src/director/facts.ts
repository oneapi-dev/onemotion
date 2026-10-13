import type { PlanScene } from "@/engine/plan";
import type { CatalogModel, DirectInput } from "./input";
import { firstNonEmpty } from "./text";

/**
 * Facts: what the director may put on screen as a number. A video that
 * shows a price, a percentage or a count the person never gave, the site
 * never says and the catalog does not hold is a false ad with their name on
 * it, so plans are checked against those sources after the model answers.
 */

/** Letters and digits only, lower case: "MiMo V2.6" → "mimov26". */
export function squash(s: string | undefined): string {
  return (s ?? "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

/** Whether text names name, ignoring case, spaces and punctuation. */
export function mentions(text: string, name: string): boolean {
  const k = squash(name);
  return k.length >= 4 && squash(text).includes(k);
}

const WEB_TLDS = new Set([
  "com", "id", "io", "ai", "app", "dev", "co", "net", "org", "xyz", "me", "so", "sh", "tech", "site", "store", "shop",
  "online", "cloud", "gg", "tv", "info", "biz", "my", "sg", "us", "uk", "studio", "design", "agency", "space", "live", "to",
]);
const URL_RE = /\b(?:https?:\/\/)?(?:www\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+([a-z]{2,24})\b(?:\/[^\s"'<>]*)?/gi;

/** The first website address written in a brief, or "". "Node.js" is not one. */
export function findUrl(text: string): string {
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0];
    if (/^https?:/i.test(raw) || WEB_TLDS.has(m[1].toLowerCase())) return raw.replace(/[.,;:!?)]+$/, "");
  }
  return "";
}

/**
 * The catalog models a brief names. A run of one to three of its words,
 * squashed ("mimo v2.6" → "mimov26"), must start the model's id or name,
 * and be specific: five characters, or four with a digit.
 */
export function matchModels(prompt: string, models: CatalogModel[], max = 4): CatalogModel[] {
  const w = prompt.toLowerCase().split(/\s+/).filter(Boolean);
  const runs: string[] = [];
  for (let i = 0; i < w.length; i++) {
    let joined = "";
    for (let n = 0; n < 3 && i + n < w.length; n++) {
      joined += squash(w[i + n]);
      if (joined.length >= 5 || (joined.length >= 4 && /\d/.test(joined))) runs.push(joined);
    }
  }
  const out: CatalogModel[] = [];
  for (const m of models) {
    const id = squash(m.id);
    const name = squash(m.name);
    if (runs.some((r) => id.startsWith(r) || (name && name.startsWith(r)))) out.push(m);
    if (out.length === max) break;
  }
  return out;
}

function trimDecimal(v: string): string {
  const f = Number(String(v).trim());
  return String(v).trim() !== "" && Number.isFinite(f) && f >= 0 ? String(f) : "";
}

function saving(ours: string, list: string): number {
  const o = Number(ours);
  const l = Number(list);
  if (!Number.isFinite(o) || !Number.isFinite(l) || l <= 0 || o >= l) return 0;
  return Math.floor((1 - o / l) * 100);
}

/** A catalog model's facts, the way the director reads them. */
export function describeModel(m: CatalogModel): string {
  let s = `${firstNonEmpty(m.name, m.id)} (API id ${m.id})`;
  if (m.tagline) s += `: ${m.tagline}`;
  const unit = m.currency && m.currency.toUpperCase() !== "USD" ? `${m.currency.toUpperCase()} ` : "$";
  const inp = trimDecimal(m.inputPrice);
  const out = trimDecimal(m.outputPrice);
  if (inp && out) {
    s += `. Price on OneAPI per 1M tokens: input ${unit}${inp}, output ${unit}${out}`;
    const li = trimDecimal(m.listInput);
    const lo = trimDecimal(m.listOutput);
    if (li && lo) {
      s += `. Official list price per 1M tokens: input ${unit}${li}, output ${unit}${lo}`;
      const pct = saving(m.inputPrice, m.listInput);
      if (pct > 0) s += ` (input ${pct}% cheaper on OneAPI)`;
    }
  }
  if (m.contextWindow) s += `. Context window: ${m.contextWindow} tokens`;
  if (m.capabilities.length) s += `. Capabilities: ${m.capabilities.join(", ")}`;
  if (m.free) s += ". Free tier: yes";
  return s;
}

/** What the director knows about OneAPI itself, given when a brief is about it. */
export const PLATFORM_FACTS =
  'OneAPI (oneapi.id) is an AI API gateway: one API key for many AI models, compatible with the OpenAI and Anthropic SDKs. API base URL: https://api.oneapi.id/v1. A model is chosen by its API id in the "model" parameter. Pay as you go from a balance, or with a plan.';

/** Whether the brief is about OneAPI or its models. */
export function aboutPlatform(input: DirectInput): boolean {
  return (input.models?.length ?? 0) > 0 || mentions(input.prompt ?? "", "oneapi") || /oneapi/i.test(input.site?.domain ?? "");
}

const NUMBER = /\d+(?:[.,]\d+)*/g;

/** Every reading of a number as written: "1,000" may be a thousand or one point zero. */
function numberForms(tok: string): string[] {
  const forms = [tok.replace(/[.,]/g, "")];
  for (const v of [tok.replaceAll(",", ""), tok.replaceAll(".", "").replaceAll(",", "."), tok.replaceAll(",", ".")]) {
    const f = Number(v);
    if (v !== "" && Number.isFinite(f)) forms.push(String(f));
  }
  return forms;
}

export class FactSet {
  private set = new Set<string>();
  constructor(sources: string[]) {
    for (const src of sources) for (const tok of src.match(NUMBER) ?? []) for (const f of numberForms(tok)) this.set.add(f);
  }
  /** Every number in text is stated by a source. Counts from 0 to 10 are free. */
  allows(text: string): boolean {
    for (const tok of text.match(NUMBER) ?? []) {
      if (/^\d+$/.test(tok) && Number(tok) <= 10) continue;
      if (!numberForms(tok).some((f) => this.set.has(f))) return false;
    }
    return true;
  }
}

/** All the text the director was given as fact. */
export function sources(input: DirectInput): string[] {
  const site = input.site;
  const out = [input.prompt, site?.name, site?.domain, site?.title, site?.description, ...(site?.headings ?? []), ...(site?.paragraphs ?? []), ...(site?.ctas ?? [])];
  for (const s of input.shots ?? []) out.push(s.heading);
  if (aboutPlatform(input)) out.push(PLATFORM_FACTS);
  for (const m of input.models ?? []) out.push(describeModel(m));
  out.push(...(input.knownModels ?? []));
  return out.filter((s): s is string => Boolean(s));
}

/**
 * Drops what the model made up: an item whose number no source states, and
 * a scene whose own text does. Code is exempt: its numbers are syntax.
 */
export function enforceFacts<T extends { scenes: PlanScene[]; caption?: string }>(plan: T, input: DirectInput): T {
  const facts = new FactSet(sources(input));
  const scenes: PlanScene[] = [];
  for (const s of plan.scenes ?? []) {
    if (!s || typeof s !== "object") continue;
    const head = [s.eyebrow, s.title, s.value, s.left, s.right, s.type === "code" ? "" : s.body].filter(Boolean).join(" ");
    if (!facts.allows(head)) continue;
    // A spoken number nobody stated silences the line, not the card.
    const narration = typeof s.narration === "string" && facts.allows(s.narration) ? s.narration : undefined;
    scenes.push({ ...s, narration, items: s.items?.filter((it) => facts.allows(`${it?.title ?? ""} ${it?.body ?? ""}`)) });
  }
  return { ...plan, scenes, caption: plan.caption && facts.allows(plan.caption) ? plan.caption : "" };
}

