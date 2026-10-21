import type { SiteInfo } from "@/director/input";
import { LIBRARY } from "@/music/library";
import { normalizeScore } from "@/music/score";
import type { FilmFormat, FilmSpec } from "../film";
import type { Partner } from "../kit/film";
import { FONT_NAMES } from "../kit/fonts";

/** The creative director's concept for one bespoke film. */
export type Concept = {
  title: string;
  language: string;
  angle: string;
  /** The recipe: the viewer's problem, the promise, and the one picture and sound the film builds to. */
  problem?: string;
  promise?: string;
  climax?: string;
  style: string;
  metaphor: string;
  world: string;
  camera: string;
  components: string[];
  typography: { display: string; text: string; mono: string | null };
  palette: { bg: string; ink: string; accent: string; support: string };
  /** The style brief: the look and structure chosen from the menus (styles.ts), which the agents follow. */
  look: ConceptLook;
  brand: { name: string; url: string };
  beats: ConceptBeat[];
  score: unknown;
  /** A built-in track id, or "composed" for the composer. */
  music: string;
  /** The art director's next two picks for this film's vibe, best first: played when its first pick was heard in a recent film. */
  musicAlternates?: string[];
  /** Tracks that take over at later beats, after the first ("music"): at most two. */
  musicPlan?: { track: string; from: string }[];
  /** Whether the film has a voice-over (false when the brief asks for none). */
  voiceover: boolean;
  /** The facts the film states, copied from the brief and the pages read: the agents' short list. */
  facts: string[];
  whyDifferent: string;
  /** What the checks changed in the model's concept and why (merged beats, a length over the limit), for the person to see. */
  notes?: string[];
};

/**
 * One beat: one section of the timeline with one narration line. Moments
 * are the shots and events inside it, so a single continuous beat can still
 * carry a whole sequence.
 */
/**
 * A beat is also a contract (the shot list): why it exists, the state the frame is in when it
 * begins and the state it leaves for the next beat, so the designer builds continuity between
 * known states instead of a run of unrelated pictures.
 */
export type ConceptBeat = { id: string; says: string; shows: string; voice: string; seconds: number; moments?: { at: string; what: string }[]; purpose?: string; enters?: string; leaves?: string };

export type ConceptLook = {
  direction: string;
  candidates: string[];
  concept: string;
  why: string;
  fingerprint: string;
  paletteSources: string;
  emphasis: string;
  backgroundMotion: string;
  surface: string;
  render: string;
  signature: string;
  specialMoment: string;
  /** How hard the film says hello, how much its beats differ, how much moves: "ENERGY 1 / RHYTHM 2 / MOTION 2". */
  dials: string;
};

export class UnusableConceptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnusableConceptError";
  }
}

/** A film is one beat or more; past this many, neighbouring beats are joined rather than dropped. */
const MAX_BEATS = 40;
/** The longest film, and the longest single beat, in seconds. */
const MAX_SECONDS = 300;
const MAX_BEAT_SECONDS = 180;
const MIN_BEAT_SECONDS = 0.8;
const CLOSE_SECONDS = 3;
const HEX = /^#[0-9a-fA-F]{6}$/;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown, max = 400) => (typeof v === "string" ? clip(v.trim(), max) : "");
const hex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v.trim()) ? v.trim().toUpperCase() : fallback);
/** Whether a font is a monospace (each one in the kit says so in its name). */
const isMono = (f: string) => /\bMono\b/.test(f);
const font = (v: unknown, fallback: string) => (typeof v === "string" && FONT_NAMES.includes(v.trim()) ? v.trim() : fallback);

/** Text cut to `max` characters at a word boundary (never mid-word), or whole when it fits. */
export function clip(s: string, max: number): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max + 1);
  const at = cut.search(/\s\S*$/);
  return (at > max * 0.6 ? cut.slice(0, at) : s.slice(0, max)).trimEnd();
}

const moment = (m: unknown) => (isRecord(m) && (typeof m.what === "string" || typeof m.does === "string") ? { at: str(String(m.at ?? ""), 60), what: str(m.what ?? m.does, 300) } : null);

/** Two neighbouring beats as one: their words, pictures, lines and moments in order, their lengths added. */
const join = (a: ConceptBeat, b: ConceptBeat): ConceptBeat => ({
  id: a.id,
  says: [a.says, b.says].filter(Boolean).join(" / "),
  shows: [a.shows, b.shows].filter(Boolean).join(" Then: "),
  voice: [a.voice, b.voice].filter(Boolean).join(" "),
  seconds: a.seconds + b.seconds,
  moments: [...(a.moments ?? []), ...(b.moments ?? [])],
  ...(a.purpose || b.purpose ? { purpose: [a.purpose, b.purpose].filter(Boolean).join(" Then: ") } : {}),
  ...(a.enters ? { enters: a.enters } : {}),
  ...(b.leaves ? { leaves: b.leaves } : {}),
});

const firstText = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (typeof o[k] === "string" && (o[k] as string).trim()) return (o[k] as string).trim();
  return "";
};

/** Seconds from a number or a written length ("3", "2.5-3.5", "4–5 s", "0:03"): a range's middle. */
const secondsOf = (v: unknown): number | undefined => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v !== "string") return undefined;
  const nums = (v.match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
  if (!nums.length) return undefined;
  return nums.length >= 2 && /[-–—]|to/.test(v) ? (nums[0] + nums[1]) / 2 : nums[0];
};

/**
 * A concept in a shape of the model's own (a cheaper model that wrote a
 * production document: "storyboard": { "scenes": [...] }, "shots", ...)
 * read into the studio's shape where the meaning is clear: each scene a
 * beat, its picture as "shows", its on-screen words as "says". A concept
 * already in shape passes through unchanged.
 */
export function coerceConcept(raw: Record<string, unknown>): Record<string, unknown> {
  if (Array.isArray(raw.beats)) return raw;
  const board = isRecord(raw.storyboard) ? raw.storyboard : null;
  const list = [board?.scenes, board?.beats, raw.storyboard, raw.scenes, raw.shots, raw.sequence, board?.shots].find((x) => Array.isArray(x) && x.some(isRecord)) as unknown[] | undefined;
  if (!list) return raw;
  const beats = list.filter(isRecord).map((s) => {
    const shows = [firstText(s, ["shows", "visual", "visuals", "picture", "description", "action", "what_happens", "scene"]), firstText(s, ["motion", "camera"])].filter(Boolean).join(" ");
    const says = firstText(s, ["says", "on_screen_text", "onscreen_text", "on_screen", "text", "copy", "headline", "caption", "typography"]);
    return { says, shows, voice: firstText(s, ["voice", "vo", "voiceover", "voice_over", "narration", "line"]), seconds: secondsOf(s.seconds ?? s.duration ?? s.duration_sec ?? s.duration_seconds ?? s.length) };
  });
  const project = isRecord(raw.project) ? raw.project : {};
  return { ...raw, title: raw.title ?? project.title, beats };
}

/**
 * A concept checked and repaired: beats renumbered b1..bn with sane lengths
 * (the last one long enough to hold the close), colours and fonts valid.
 * One beat is a film (a single continuous shot); too many beats are joined
 * pairwise, never dropped; a length over the limit is scaled down; each
 * change is written in `notes`. A concept with no beat at all cannot be
 * built and throws, naming what is missing so the model can be asked again.
 */
export function normalizeConcept(input: unknown): Concept {
  if (!isRecord(input)) throw new UnusableConceptError("The concept was not a JSON object.");
  const raw = coerceConcept(input);
  const notes: string[] = [];
  const rawBeats = Array.isArray(raw.beats) ? raw.beats.filter(isRecord) : [];
  if (!rawBeats.length) throw new UnusableConceptError(Array.isArray(raw.beats) ? "\"beats\" is empty: the concept needs at least one beat." : "\"beats\" is missing: the concept needs a list of beats.");
  let beats: ConceptBeat[] = rawBeats.map((b, i) => {
    const moments = Array.isArray(b.moments) ? b.moments.map(moment).filter((m): m is { at: string; what: string } => Boolean(m?.what)).slice(0, 24) : [];
    return {
      id: `b${i + 1}`,
      says: str(b.says, 400),
      shows: str(b.shows, 1200),
      voice: str(b.voice, 2000),
      seconds: Math.min(MAX_BEAT_SECONDS, Math.max(MIN_BEAT_SECONDS, typeof b.seconds === "number" && Number.isFinite(b.seconds) ? b.seconds : 2.5)),
      ...(moments.length ? { moments } : {}),
      ...(str(b.purpose, 300) ? { purpose: str(b.purpose, 300) } : {}),
      ...(str(b.enters, 300) ? { enters: str(b.enters, 300) } : {}),
      ...(str(b.leaves, 300) ? { leaves: str(b.leaves, 300) } : {}),
    };
  });
  // A beat without "shows" leaves the designer guessing the whole film (a model that answered in its own shape): ask again.
  const blank = beats.filter((b) => !b.shows.trim()).map((b) => b.id);
  if (blank.length) throw new UnusableConceptError(`${blank.length === beats.length ? 'No beat has "shows"' : `${blank.length} of ${beats.length} beats (${blank.slice(0, 6).join(", ")}) ${blank.length === 1 ? "lacks" : "lack"} "shows"`}: every beat needs "shows" (what the viewer sees, concretely) and "says" (its on-screen words), with the exact key names of the schema.`);
  if (beats.length > MAX_BEATS) {
    const was = beats.length;
    while (beats.length > MAX_BEATS) {
      // The shortest neighbouring pair joins first: the film's long beats keep their shape. The close stays its own beat.
      let at = 0;
      for (let i = 1; i < beats.length - 2; i++) if (beats[i].seconds + beats[i + 1].seconds < beats[at].seconds + beats[at + 1].seconds) at = i;
      beats.splice(at, 2, join(beats[at], beats[at + 1]));
    }
    notes.push(`The concept had ${was} beats; neighbouring beats were joined into ${beats.length} (nothing was dropped).`);
  }
  beats = beats.map((b, i) => ({ ...b, id: `b${i + 1}` }));
  beats[beats.length - 1].seconds = Math.max(CLOSE_SECONDS, beats[beats.length - 1].seconds);
  const total = beats.reduce((a, b) => a + b.seconds, 0);
  if (total > MAX_SECONDS) {
    for (const b of beats) b.seconds = Math.max(MIN_BEAT_SECONDS, (b.seconds * MAX_SECONDS) / total);
    notes.push(`The beats added up to ${Math.round(total)} s, over the ${MAX_SECONDS} s limit; every beat was shortened in proportion.`);
  }
  const typo = isRecord(raw.typography) ? raw.typography : {};
  const pal = isRecord(raw.palette) ? raw.palette : {};
  const brand = isRecord(raw.brand) ? raw.brand : {};
  const look = isRecord(raw.look) ? raw.look : {};
  const typography = { display: font(typo.display, "Space Grotesk"), text: font(typo.text, "Inter"), mono: typo.mono ? font(typo.mono, "JetBrains Mono") : null };
  // A film set wholly in monospace reads as a terminal, stiff: mono is for code, numbers and labels. "Brutalist mono"
  // pairs it with a condensed face (its menu entry), so that one gets a condensed display; any other gets a sans text face.
  if (isMono(typography.display) && isMono(typography.text)) {
    const brutalist = /brutalist/i.test(str(look.direction, 120));
    const was = `${typography.display} / ${typography.text}`;
    if (brutalist) typography.display = "Bebas Neue";
    else typography.text = "Inter Tight";
    notes.push(`The display and text faces were both monospace (${was}); ${brutalist ? "the display is now Bebas Neue, the condensed face Brutalist mono pairs with" : "the text face is now Inter Tight"}, and mono stays for code, numbers and labels.`);
  }
  return {
    title: str(raw.title, 120),
    language: /^[a-z]{2}$/.test(str(raw.language, 5)) ? str(raw.language, 5) : "en",
    angle: str(raw.angle),
    problem: str(raw.problem, 300),
    promise: str(raw.promise, 300),
    climax: str(raw.climax, 300),
    style: str(raw.style, 120),
    metaphor: str(raw.metaphor),
    world: str(raw.world),
    camera: str(raw.camera),
    components: Array.isArray(raw.components) ? raw.components.map((c) => str(c, 300)).filter(Boolean).slice(0, 6) : [],
    typography,
    palette: { bg: hex(pal.bg, "#F4F2EC"), ink: hex(pal.ink, "#151515"), accent: hex(pal.accent, "#FF4F1F"), support: hex(pal.support, "#2F6BFF") },
    look: {
      direction: str(look.direction, 120),
      candidates: Array.isArray(look.candidates) ? look.candidates.map((c) => str(c, 80)).filter(Boolean).slice(0, 3) : [],
      concept: str(look.concept, 80),
      why: str(look.why, 300),
      fingerprint: str(look.fingerprint, 400),
      paletteSources: str(look.palette_sources, 300),
      emphasis: str(look.emphasis, 120),
      backgroundMotion: str(look.background_motion, 200),
      surface: str(look.surface, 160),
      render: str(look.render, 120),
      signature: str(look.signature, 200),
      specialMoment: str(look.special_moment, 200),
      dials: str(look.dials, 80),
    },
    brand: { name: str(brand.name, 60), url: str(brand.url, 80).replace(/^https?:\/\//, "").replace(/\/$/, "") },
    beats,
    score: raw.score,
    music: LIBRARY.some((t) => t.id === raw.music) || raw.music === "composed" ? String(raw.music) : "",
    musicAlternates: Array.isArray(raw.music_alternates) ? [...new Set(raw.music_alternates.filter((m): m is string => typeof m === "string" && m !== raw.music && LIBRARY.some((t) => t.id === m)))].slice(0, 2) : [],
    ...(musicPlanOf(raw.music_plan, beats, String(raw.music ?? "")).length ? { musicPlan: musicPlanOf(raw.music_plan, beats, String(raw.music ?? "")) } : {}),
    voiceover: raw.voiceover !== false,
    facts: Array.isArray(raw.facts) ? raw.facts.map((f) => str(f, 240)).filter(Boolean).slice(0, 25) : [],
    whyDifferent: str(raw.why_different),
    ...(notes.length ? { notes } : {}),
  };
}

/**
 * The tracks that take over at later beats: library tracks only, each on a real beat after the first,
 * in the film's order, a different track from the one playing before it, at most two.
 */
export function musicPlanOf(raw: unknown, beats: { id: string }[], first: string): { track: string; from: string }[] {
  if (!Array.isArray(raw)) return [];
  const at = (id: string) => beats.findIndex((b) => b.id === id);
  const plan = raw
    .filter(isRecord)
    .map((e) => ({ track: str(e.track, 60), from: str(e.from, 8) }))
    .filter((e) => LIBRARY.some((t) => t.id === e.track) && at(e.from) > 0)
    .sort((a, b) => at(a.from) - at(b.from));
  const out: { track: string; from: string }[] = [];
  for (const e of plan) {
    const before = out.length ? out[out.length - 1].track : first;
    if (e.track !== before && !out.some((x) => x.from === e.from)) out.push(e);
  }
  return out.slice(0, 2);
}

/** The film a concept describes, in the chosen format, with the website's logo and colour when it was read. */
/**
 * The built-in track a film plays: the concept's pick, else one picked by the
 * seed from those the recent films did not use. "composed" keeps the composer.
 */
export function trackFor(concept: Concept, seed: number, recent: string[] = []): string | undefined {
  if (concept.music === "composed") return undefined;
  const fresh = LIBRARY.filter((t) => !recent.includes(t.id));
  const pool = fresh.length ? fresh : LIBRARY;
  const asked = LIBRARY.find((t) => t.id === concept.music);
  if (!asked) return pool[seed % pool.length]?.id;
  // The art director's picks for this film's vibe, best first, skipping any a recent film already played:
  // models pick the same "tech" track for every tech product.
  const picks = [asked.id, ...(concept.musicAlternates ?? [])];
  const unused = picks.find((id) => !recent.includes(id));
  if (unused) return unused;
  if (!fresh.length) return asked.id;
  // All three were heard lately: the unused track closest to the first pick in mood, then in tempo.
  const score = (t: (typeof LIBRARY)[number]) => t.tags.filter((x) => asked.tags.includes(x)).length * 2 - Math.abs(t.bpm - asked.bpm) / 20;
  const ranked = [...fresh].sort((a, b) => score(b) - score(a));
  // Among equally close tracks, the seed decides, so two films after the same repeat differ too.
  const best = ranked.filter((t) => score(t) === score(ranked[0]));
  return best[seed % best.length].id;
}

/** The second brand of a collaboration film, as read from its website. */
export type FilmPartner = { site: SiteInfo; lead: Partner["lead"] };

/** The partner as the film draws it: its name, address, logo and colour. */
export const partnerOf = (p: FilmPartner): Partner => ({ name: p.site.name || p.site.domain, url: p.site.domain, logo: p.site.logo ?? null, colors: p.site.accent && HEX.test(p.site.accent) ? [p.site.accent] : [], lead: p.lead });

export function filmSpecOf(concept: Concept, format: FilmFormat, site: SiteInfo | null, seed: number, recentTracks: string[] = [], partner?: FilmPartner | null): FilmSpec {
  const track = LIBRARY.find((t) => t.id === trackFor(concept, seed, recentTracks));
  const colors = [site?.accent, concept.palette.accent, concept.palette.support].filter((c): c is string => typeof c === "string" && HEX.test(c));
  return {
    format,
    beats: concept.beats,
    brand: { name: concept.brand.name || site?.name || "", url: concept.brand.url || site?.domain || "", logo: site?.logo ?? null, colors: [...new Set(colors)] },
    ...(partner ? { partner: partnerOf(partner) } : {}),
    // A built-in track sets the tempo the beats snap to.
    score: track ? { ...normalizeScore(concept.score, concept.beats.length, "corporate-pop", seed), bpm: track.bpm } : normalizeScore(concept.score, concept.beats.length, "corporate-pop", seed),
    ...(track ? { track: track.id } : {}),
    // The plan's later tracks play after whichever first track the film ended up with.
    ...(track && concept.musicPlan?.some((c) => c.track !== track.id) ? { cues: concept.musicPlan.filter((c, i, all) => c.track !== (i ? all[i - 1].track : track.id)) } : {}),
  };
}
