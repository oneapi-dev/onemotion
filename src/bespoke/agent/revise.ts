import { LIBRARY } from "@/music/library";
import type { FilmSpec } from "../film";
import type { FilmBeat } from "../timing";
import { BEATS_DIR, BEATS_INDEX, beatFile, beatsIndex, stubBeat } from "./parallel";
import { SchemaError } from "./llm";
import type { Concept } from "./concept";

/**
 * "Improve with AI" on a finished film: the person's note becomes a
 * structured edit of the film's state (its beats, words, voice lines,
 * music and code), never a new film. What the note does not touch, and
 * everything the person locked, stays exactly as it was: locks are kept
 * by this code, not by asking the model nicely.
 */

/** The parts of a film a note can change. */
export const AREAS = ["visuals", "typography", "animation", "camera", "transitions", "layout", "color", "pacing", "onscreen-text", "narration", "structure", "music", "sound"] as const;
export type Area = (typeof AREAS)[number];

/** What must not change. */
export type Locks = { narration: boolean; text: boolean; structure: boolean; music: boolean; visuals: boolean };
export const NO_LOCKS: Locks = { narration: false, text: false, structure: false, music: false, visuals: false };

/** Areas that live in the scene's code: changing one means the designer edits files. */
const CODE_AREAS = new Set<Area>(["visuals", "typography", "animation", "camera", "transitions", "layout", "color", "onscreen-text", "sound", "structure"]);

export type BeatEdit = { id: string; says?: string; voice?: string; shows?: string; seconds?: number };
export type NewBeat = { after: string; says: string; voice: string; shows: string; seconds: number };

/** The editor's plan for one note. */
export type RevisionPlan = {
  /** What will change, in a sentence or two, for the person. */
  summary: string;
  areas: Area[];
  /** Beats the change is about (empty: the whole film). */
  targets: string[];
  edits: BeatEdit[];
  add: NewBeat[];
  remove: string[];
  /** A built-in track to switch to. */
  track?: string;
  /** Concrete instructions for the motion designer: what to change in which beat, with values. */
  design: string;
};

/** What applying a plan did. */
export type Applied = {
  concept: Concept;
  spec: FilmSpec;
  files: Record<string, string>;
  /** Beats (by index in the new spec) whose voice line changed or is new: to record again. */
  revoice: number[];
  /** Whether the scene's code has to change. */
  code: boolean;
  /** Parts of the plan the locks refused, said for the person. */
  refused: string[];
  /** Whether the music changed. */
  music: boolean;
};

const NEG = /\b(without|w\/o|don'?t|do not|never|no|keep|keeping|preserve|leave|same|jangan|tanpa|tetap|pertahankan|biarkan|tidak)\b/i;
const NARRATION = /\b(narration|narrator|voice(?:-?over)?|vo|script|spoken|narasi|naskah|suara|sulih suara|dubbing)\b/i;
const TEXT = /\b(on-?screen text|text on screen|copy|headlines?|wording|words|teks|tulisan|kata-kata)\b/i;
const STRUCTURE = /\b(scene structure|structure|scenes?|order|beats?|storyboard|struktur|urutan|adegan|scene-nya)\b/i;
const MUSIC = /\b(music|track|soundtrack|song|musik|lagu)\b/i;
const KEEP_VISUALS = /\b(keep|tetap|pertahankan|same|don'?t change|do not change|jangan ubah)\b[^.]{0,25}\b(visuals?|look|design|tampilan|animasi|animations?)\b/i;

/**
 * Locks a note asks for in words ("improve the timing without changing the
 * narration", "jangan ubah narasinya"): a negation or "keep" near the
 * thing, in the same clause.
 */
export function inferLocks(note: string): Locks {
  const locks = { ...NO_LOCKS };
  for (const clause of note.split(/[.;!?\n]|,?\s+(?:but|tapi|namun|then)\s+/i)) {
    const m = NEG.exec(clause);
    if (!m) continue;
    const after = clause.slice(m.index);
    if (NARRATION.test(after)) locks.narration = true;
    if (TEXT.test(after)) locks.text = true;
    if (STRUCTURE.test(after) && /\b(structure|struktur|order|urutan)\b/i.test(after)) locks.structure = true;
    if (MUSIC.test(after)) locks.music = true;
    if (KEEP_VISUALS.test(after)) locks.visuals = true;
  }
  return locks;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const text = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : undefined);
const secs = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.min(180, Math.max(0.8, v)) : undefined);

/** The editor's JSON as a plan, against the film it edits: unknown beats and areas are problems the model is asked to fix. */
export function normalizeRevision(raw: unknown, spec: FilmSpec): RevisionPlan {
  if (!isRecord(raw)) throw new SchemaError(["the answer is not a JSON object"]);
  const ids = new Set(spec.beats.map((b) => b.id));
  const problems: string[] = [];
  const areas = (Array.isArray(raw.areas) ? raw.areas : []).filter((a): a is Area => (AREAS as readonly unknown[]).includes(a));
  if (!areas.length) problems.push(`"areas" must name at least one of: ${AREAS.join(", ")}`);
  const known = (id: unknown, field: string) => {
    if (typeof id === "string" && ids.has(id)) return id;
    problems.push(`${field} "${String(id)}" is not a beat of this film (beats: ${[...ids].join(", ")})`);
    return null;
  };
  const targets = (Array.isArray(raw.targets) ? raw.targets : []).filter((t) => typeof t === "string" && ids.has(t)) as string[];
  const edits: BeatEdit[] = [];
  for (const e of Array.isArray(raw.edits) ? raw.edits : []) {
    if (!isRecord(e)) continue;
    const id = known(e.id, "edits: beat");
    if (!id) continue;
    const edit: BeatEdit = { id };
    const says = text(e.says, 400);
    const voice = text(e.voice, 2000);
    const shows = text(e.shows, 1200);
    const seconds = secs(e.seconds);
    if (says !== undefined) edit.says = says;
    if (voice !== undefined) edit.voice = voice;
    if (shows !== undefined) edit.shows = shows;
    if (seconds !== undefined) edit.seconds = seconds;
    if (Object.keys(edit).length > 1) edits.push(edit);
  }
  const add: NewBeat[] = [];
  for (const a of Array.isArray(raw.add) ? raw.add : []) {
    if (!isRecord(a)) continue;
    const after = known(a.after, "add: after beat");
    if (after) add.push({ after, says: text(a.says, 400) ?? "", voice: text(a.voice, 2000) ?? "", shows: text(a.shows, 1200) ?? "", seconds: secs(a.seconds) ?? 2.5 });
  }
  const remove = (Array.isArray(raw.remove) ? raw.remove : []).map((r) => known(r, "remove: beat")).filter((r): r is string => Boolean(r));
  if (remove.length && remove.length >= spec.beats.length + add.length) problems.push("the plan removes every beat: a film keeps at least one");
  const track = typeof raw.track === "string" && raw.track ? raw.track : undefined;
  if (track && !LIBRARY.some((t) => t.id === track)) problems.push(`track "${track}" is not a built-in track (${LIBRARY.map((t) => t.id).join(", ")})`);
  const design = text(raw.design, 6000) ?? "";
  if (areas.some((a) => CODE_AREAS.has(a)) && design.length < 20) problems.push(`"design" must say concretely what the motion designer changes (areas ${areas.join(", ")} live in the code)`);
  if (problems.length) throw new SchemaError(problems);
  return { summary: text(raw.summary, 600) ?? "", areas, targets, edits, add, remove, ...(track ? { track } : {}), design };
}

/** A fresh beat id: never reuses one, so the code's cues keep meaning the beats they meant. */
const freshId = (taken: Set<string>) => {
  let n = taken.size + 1;
  while (taken.has(`b${n}`)) n++;
  taken.add(`b${n}`);
  return `b${n}`;
};

/**
 * The film after a plan, with the locks kept: a locked part's edits are
 * refused and listed, whatever the model planned. Beat ids are stable
 * (new beats get new ids), so the code's cues still find their beats.
 */
export function applyRevision(film: { concept: Concept; spec: FilmSpec; files: Record<string, string> }, plan: RevisionPlan, locks: Locks): Applied {
  const refused: string[] = [];
  const allowNarration = !locks.narration && plan.areas.includes("narration");
  const allowText = !locks.text && (plan.areas.includes("onscreen-text") || plan.areas.includes("narration") || plan.areas.includes("structure"));
  const allowStructure = !locks.structure && plan.areas.includes("structure");
  const allowPacing = !locks.structure && (plan.areas.includes("pacing") || plan.areas.includes("structure"));
  const allowMusic = !locks.music && (plan.areas.includes("music") || plan.areas.includes("pacing"));
  const allowCode = !locks.visuals || allowText || allowStructure;

  const revoice = new Set<string>();
  let beats: FilmBeat[] = film.spec.beats.map((b) => {
    const e = plan.edits.find((x) => x.id === b.id);
    if (!e) return b;
    const next: FilmBeat = { ...b };
    if (e.voice !== undefined && e.voice !== (b.voice ?? "")) {
      if (allowNarration) {
        next.voice = e.voice;
        delete next.tts;
        delete next.voiceSeconds;
        delete next.words;
        revoice.add(b.id);
      } else refused.push(`the voice line of ${b.id} (${locks.narration ? "narration is locked" : "the note is not about narration"})`);
    }
    if (e.says !== undefined && e.says !== b.says) {
      if (allowText) next.says = e.says;
      else refused.push(`the on-screen words of ${b.id} (${locks.text ? "text is locked" : "the note is not about the words"})`);
    }
    if (e.shows !== undefined) next.shows = e.shows;
    if (e.seconds !== undefined && Math.abs(e.seconds - b.seconds) > 0.05) {
      if (allowPacing) next.seconds = e.seconds;
      else refused.push(`the length of ${b.id} (${locks.structure ? "structure is locked" : "the note is not about pacing"})`);
    }
    return next;
  });

  if (plan.remove.length || plan.add.length) {
    if (!allowStructure) refused.push(`${plan.add.length ? `adding ${plan.add.length} beat(s)` : ""}${plan.add.length && plan.remove.length ? " and " : ""}${plan.remove.length ? `removing ${plan.remove.join(", ")}` : ""} (${locks.structure ? "the structure is locked" : "the note is not about the structure"})`);
    else {
      beats = beats.filter((b) => !plan.remove.includes(b.id));
      const taken = new Set(film.spec.beats.map((b) => b.id));
      for (const a of plan.add) {
        const at = beats.findIndex((b) => b.id === a.after);
        const nb: FilmBeat = { id: freshId(taken), says: a.says, shows: a.shows, voice: a.voice, seconds: a.seconds };
        beats.splice(at < 0 ? beats.length : at + 1, 0, nb);
        if (nb.voice) revoice.add(nb.id);
      }
    }
  }

  let spec: FilmSpec = { ...film.spec, beats };
  let music = false;
  if (plan.track && plan.track !== film.spec.track) {
    if (allowMusic) {
      const t = LIBRARY.find((x) => x.id === plan.track);
      if (t) {
        spec = { ...spec, track: t.id, score: { ...spec.score, bpm: t.bpm } };
        music = true;
      }
    } else refused.push(`switching the music to ${plan.track} (${locks.music ? "music is locked" : "the note is not about music"})`);
  }

  // The beats' files follow the beats: new ones start empty, removed ones go, the index is regenerated.
  const files = { ...film.files };
  const ids = beats.map((b) => b.id);
  if (files[BEATS_INDEX] !== undefined && ids.join() !== film.spec.beats.map((b) => b.id).join()) {
    files[BEATS_INDEX] = beatsIndex(ids);
    for (const id of ids) files[beatFile(id)] ??= stubBeat(id);
    for (const p of Object.keys(files)) {
      const m = p.startsWith(BEATS_DIR) ? /^scene\/beats\/(b\d+)(?:\.tsx|\/)/.exec(p) : null;
      if (m && !ids.includes(m[1])) delete files[p];
    }
  }

  const textChanged = beats.some((b) => {
    const was = film.spec.beats.find((x) => x.id === b.id);
    return !was || was.says !== b.says;
  });
  const structural = ids.join() !== film.spec.beats.map((b) => b.id).join();
  const wantsCode = plan.areas.some((a) => CODE_AREAS.has(a) && a !== "structure") || textChanged || structural;
  const code = wantsCode && allowCode;
  if (wantsCode && !allowCode) refused.push("changes to the visuals (visuals are locked)");

  const order = new Map(beats.map((b, i) => [b.id, i]));
  return {
    concept: { ...film.concept, beats: beats.map((b) => ({ id: b.id, says: b.says, shows: b.shows, voice: b.voice ?? "", seconds: b.seconds, ...(b.moments ? { moments: b.moments } : {}) })) },
    spec,
    files,
    revoice: [...revoice].map((id) => order.get(id)).filter((i): i is number => i !== undefined),
    code,
    refused,
    music,
  };
}

const CUE_CALL = /\bcue\(\s*(["'`])([^"'`$]+)\1\s*\)/g;

/**
 * Cues in the code that no longer find their beat or word ("b4" after b4
 * was removed, "b2:gateway" after b2's line stopped saying it): the
 * designer fixes them before the film plays, or the render stops on them.
 */
export function brokenCues(files: Record<string, string>, beats: { id: string; voice?: string; says: string; words?: { text: string }[] }[]): string[] {
  const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^\p{L}\p{N}]/gu, "");
  const out = new Set<string>();
  for (const [path, src] of Object.entries(files)) {
    // Inside a beat's own file, useBeat().cue("word") is a word of that beat.
    const own = /^scene\/beats\/(b\d+)(?:\.tsx?|\/)/.exec(path)?.[1];
    for (const m of src.matchAll(CUE_CALL)) {
      const c = m[2].trim();
      const local = own && !/^(b\d+|end|@)/.test(c) ? /^([^#@+\s-]+)/.exec(c) : null;
      const head = local ? [c, own, local[1]] : /^(b\d+)(?::([^#@+\s-]+))?/.exec(c);
      if (!head) continue;
      const beat = beats.find((b) => b.id === head[1]);
      if (!beat) {
        out.add(`${path}: cue("${c}") names beat ${head[1]}, which is no longer in the film`);
        continue;
      }
      if (!head[2]) continue;
      const want = norm(head[2]);
      const words = (beat.words?.length ? beat.words.map((w) => w.text) : (beat.voice || beat.says).split(/\s+/)).map(norm);
      if (!words.some((w) => w === want || (want.length >= 3 && w.startsWith(want)))) out.add(`${path}: cue("${c}"): beat ${beat.id} no longer says "${head[2]}" (it says: ${beat.voice || beat.says})`);
    }
  }
  return [...out];
}

/** The editor's system prompt: turns a note into a plan over the film's state. */
export function revisePrompt(): string {
  return `You are the creative editor of a motion studio. A finished film exists: its beats (each with on-screen words "says", a voice line "voice", what it "shows" and its length), its music and its code. The person writes a note about it. You turn the note into the smallest set of edits that fully answers it. You never start the film over.

Reply with ONE JSON object and nothing else:
{
  "summary": "what will change, one or two sentences, in the person's language",
  "areas": ["the parts the note is about, from: ${AREAS.join(", ")}"],
  "targets": ["beat ids the note is about; empty for the whole film"],
  "edits": [ { "id": "b2", "says": "new on-screen words (only if they change)", "voice": "new voice line (only if it changes)", "shows": "new picture description (only if it changes)", "seconds": 3.2 } ],
  "add": [ { "after": "b3", "says": "...", "voice": "...", "shows": "...", "seconds": 2.5 } ],
  "remove": ["b5"],
  "track": "a built-in track id, only when the note asks for other music",
  "design": "instructions for the motion designer who edits the code: per beat, what to change and how, with concrete values (px, frames, easing, which element, which transition). Empty when nothing in the code changes."
}

Rules:
- Answer the note, all of it, and touch nothing else. A note about typography changes type (faces from the film's palette and font list, sizes, weights, tracking, line breaks, hierarchy), never the narration. A note about music changes the track, never the picture. A note about animation or timing changes motion curves, durations, staggers and when things happen; it keeps the words and the voice.
- The person's locks are listed in the message. Never plan an edit to a locked part.
- Make the change real: a note like "more cinematic" becomes specific decisions (slower camera with a long ease, fewer cuts, a wider then tighter framing, a darker palette moment, a held silence before the reveal), not adjectives.
- "edits" holds only fields that change. Numbers, prices and names on screen come from the film's facts, except where the note gives its own: the note is the person's word and wins. A note that sets new prices, a discount or a new claim replaces the old figures everywhere they appear (every beat's "says" and "voice", and the "design" for the code), written exactly as the note writes them; never keep or round back to the old ones.
- Structure ("add", "remove", lengths) changes only when the note asks for it.
- Built-in tracks: ${LIBRARY.map((t) => `${t.id} (${t.mood}, ${t.bpm} BPM)`).join("; ")}.`;
}

/** The note and the film as the editor reads them. */
export function reviseMessage(o: { note: string; locks: Locks; targets: string[]; concept: Concept; spec: FilmSpec }): string {
  const locked = (Object.entries(o.locks) as [keyof Locks, boolean][]).filter(([, v]) => v).map(([k]) => k);
  return [
    `NOTE: ${o.note}`,
    `LOCKED (never change): ${locked.length ? locked.join(", ") : "nothing"}`,
    o.targets.length ? `THE PERSON SELECTED: ${o.targets.join(", ")} (edit only these beats)` : "",
    `FILM: "${o.concept.title}", ${o.concept.style}; look ${o.concept.look?.direction ?? ""}; type ${o.concept.typography.display} / ${o.concept.typography.text}; palette ${JSON.stringify(o.concept.palette)}; music ${o.spec.track ?? `${o.spec.score.genre} (composed)`} at ${o.spec.score.bpm} BPM.`,
    `BEATS:\n${o.spec.beats.map((b) => `- ${b.id} (${b.seconds.toFixed(1)} s): says "${b.says}" | voice "${b.voice ?? ""}" | shows: ${b.shows}`).join("\n")}`,
    `FACTS: ${o.concept.facts.join(" | ") || "(the brief's)"} (the NOTE wins over any of these)`,
    "Return the plan JSON.",
  ]
    .filter(Boolean)
    .join("\n\n");
}
