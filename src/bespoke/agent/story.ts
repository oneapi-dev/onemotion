/**
 * Whether a concept is a story or a run of slides: a concept whose beats
 * are the brief's own quoted or bold lines, one per beat, most of them in
 * the brief's order, is slides (a cheap reading of a brief that lists its
 * taglines). And whether a scene gives its beats their sounds. Pure.
 */

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[*“”"'’‘`]/g, "")
    .replace(/[^\p{L}\p{N}$%→>+.\s-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The lines a brief sets apart as on-screen words: in quotes, or in bold (headings ending in ":" are not words on screen). */
export function briefLines(brief: string): string[] {
  const out: string[] = [];
  for (const m of brief.matchAll(/[“"]([^”"\n]{2,120})[”"]/g)) out.push(m[1]);
  for (const m of brief.matchAll(/\*\*([^*\n]{2,120})\*\*/g)) out.push(m[1]);
  return [...new Set(out.map(norm).filter((l) => l.length >= 3 && !/:$/.test(l)))];
}

/**
 * A brief's own short lines, for a brief that sets none apart: a list of
 * facts written one per line ("Input US$0.30 > $0.19") is what its film says
 * on screen just as much. Only the person's text (before what the form
 * adds), and never a storyboard, whose scenes are the film's beats by right.
 */
export function plainLines(brief: string): string[] {
  const own = brief.split(/\n\s*FROM THE FORM:/)[0];
  if (/storyboard|\bscene\b|\badegan\b|\b\d+(?:\.\d+)?\s*[-–]\s*\d+(?:\.\d+)?\s*(?:s|sec|detik)\b/i.test(own)) return [];
  return [...new Set(own.split("\n").map(norm).filter((l) => l.length >= 3 && l.length <= 80 && !/:$/.test(l)))];
}

/** Words and figures, without addresses and punctuation. */
const tokens = (s: string) =>
  norm(s)
    .replace(/\b[\w-]+\.(id|com|io|ai|dev|app|net|org)\b/g, " ")
    .split(/[^\p{L}\p{N}$%]+/u)
    .map((t) => t.replace(/^\$/, ""))
    .filter((t) => t.length > 0 && t !== "$");

/** A beat whose words are (almost) all words of the brief's set-apart lines: a tagline, or several run together. */
const isLine = (says: string, vocab: Set<string>) => {
  const t = tokens(says);
  return t.length > 0 && t.filter((w) => vocab.has(w)).length >= t.length * 0.8;
};

/**
 * Slides: at least 3 beats, and 60 % or more of them nothing but the
 * brief's taglines. The order is not needed: a reshuffled list of slogans
 * is still slides.
 */
export function isSlides(beats: { says: string }[], brief: string): boolean {
  const set = briefLines(brief);
  const lines = set.length >= 3 ? set : plainLines(brief);
  if (beats.length < 3 || lines.length < 3) return false;
  const vocab = new Set(lines.flatMap(tokens));
  const hits = beats.filter((b) => isLine(b.says, vocab)).length;
  return hits >= Math.ceil(beats.length * 0.6);
}

/** Words a close may hold: the logo, one line, the offer once, the call to action, the address. */
const CLOSE_WORDS = 14;

/** Whether the last beat crams the brief's lines into the close instead of the story. */
export function crowdedClose(beats: { says: string }[]): boolean {
  const last = beats[beats.length - 1];
  return Boolean(last) && tokens(last.says).length > CLOSE_WORDS;
}

/** What the art director is told when the close came back crammed with lines. */
export const CLOSE_FIX = `The close is crammed: its words are more than a viewer reads in the last seconds. Keep it to the logo, one line, the offer once, the call to action and the address (about 12 words at most), and move the brief's other quoted lines into earlier beats, where the story needs them (copied exactly). Keep everything else. Reply with the complete concept JSON only.`;

/** What the art director is told when the concept came back as slides. */
export const SLIDES_FIX = `This concept is slides: almost every beat is one of the brief's taglines on its own. Rewrite it as a story, keeping the schema: the viewer's "problem", the "promise", the "climax" (one picture and one sound), and beats that follow a situation the viewer recognises, its tension, the turn the product or the offer brings, and what changes after. The brief's quoted lines still appear exactly as written, but where the story needs them (several may share a beat, some ride under a picture); the offer's figures appear at most twice (the hook and the close). Reply with the complete concept JSON only.`;

/** How many beats a scene leaves without any sound cue: every beat (and every transition) should have its sound. A <World> plays each camera move itself. */
export function silentBeats(beats: number, files: Record<string, string>): number {
  const all = Object.values(files).join("\n");
  const cues = all.match(/<Sfx\b/g)?.length ?? 0;
  const moves = /<World\b/.test(all) && !/<World\b[^>]*\bsound=\{false\}/.test(all) ? Math.max(0, beats - 1) : 0;
  return Math.max(0, beats - cues - moves);
}

/**
 * Slides measured in the code: a stage that plays the beats one after another in one place
 * (<Beats>), and beats that fade out as they end (an exit on `len`), the next one replacing them.
 * In one world nothing leaves when its beat ends: the camera moves on.
 */
export function slideIssues(files: Record<string, string>): string[] {
  const out: string[] = [];
  if (/<Beats\b/.test(files["scene/index.tsx"] ?? "")) out.push("scene/index.tsx plays the beats with <Beats>, one replacing the other in the same place like slides: render them with <World of={BEATS} /> so the camera travels from station to station through one world");
  const fading = Object.entries(files)
    .filter(([p]) => /^scene\/beats\/b[^/]*\.tsx$/.test(p))
    .filter(([, src]) => {
      const exits = [...src.matchAll(/(?:const|let)\s+(\w+)\s*=\s*prog\(\s*\w+\s*,\s*len\b/g)].map((m) => m[1]);
      return /opacity:\s*\(?\s*1\s*-\s*prog\(\s*\w+\s*,\s*len\b/.test(src) || exits.some((x) => new RegExp(`opacity:\\s*\\(?\\s*1\\s*-\\s*${x}\\b`).test(src));
    })
    .map(([p]) => p.replace(/^scene\/beats\/|\.tsx$/g, ""));
  if (fading.length) out.push(`${fading.join(", ")} fade${fading.length === 1 ? "s" : ""} out as ${fading.length === 1 ? "it ends" : "they end"}, like a slide: in one world nothing leaves when its beat ends (the camera moves on and may come back), so remove the exit and let the station stay`);
  return out;
}
