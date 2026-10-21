import type { Beat } from "../kit/film";
import { BEATS_INDEX, beatFile } from "./parallel";

/**
 * The tasks of a team building one film: the lead's foundation, each beat
 * agent's beat, and the lead's pass joining them up. They share the
 * system prompt (the craft, the rules, the kit); these say who does what.
 */

export function leadFoundationTask(o: { context: string; beats: Beat[] }): string {
  return `${o.context}

You are the LEAD of a small team building this film. Its beats (${o.beats.map((b) => b.id).join(", ")}) are written IN PARALLEL by one agent each, in ${beatFile("<id>")}: each beat is a station of one world. You do not write beats. Your job now is the foundation every beat builds on, in at most 4 replies:

1. Call \`timing\`.
2. scene/theme.ts: the palette, fonts, type scale, spacing, stroke widths and motion constants as exported constants.
3. scene/components/*.tsx: the shared pieces the beats reuse: the backdrop, recurring metaphor objects, a headline style, the brand lockup for the close.
4. scene/index.tsx: export \`fonts\` and \`background\`, render the backdrop and \`<World of={BEATS} />\` from @kit (\`import { BEATS } from "./beats"\`), its layout and move chosen from the concept's camera, with what carries across the beats (the story device) as its children. ${BEATS_INDEX} is generated: never write it.
5. \`check\`, then \`finish\` with NOTES FOR THE BEAT AGENTS: for every beat, what its station holds and where (a flex layout, or frame px), what to import from theme and components, how it enters, and what carries over from the station before. Be concrete: px, component names, frames.

${BASELINE_NOTE} The baseline beats import BG, INK, ACCENT, SUPPORT, DISPLAY, TEXT and MONO from scene/theme.ts: keep those exports (add your own beside them). Keep the foundation small and solid: the beat agents carry the content.`;
}

/** What every designer is told about the film it starts from. */
export const BASELINE_NOTE = `THE FILM ALREADY PLAYS: the studio wrote a baseline from the concept: one world (scene/index.tsx renders <World>, and the camera travels from station to station), its theme (scene/theme.ts) and one station per beat that already shows its words with a finished moment from the kit. That is the floor, not the film: it is plain and generic. Make every beat your own (the concept's world and metaphor, its hero picture, its supporting layers, its motion, its sounds), rewrite whatever you like, keep the one world, and never leave a beat thinner or emptier than the baseline: a beat cut to a sketch goes back to the baseline.`;

export function beatTask(o: { context: string; beat: Beat; index: number; beats: Beat[]; notes: string; shared: Record<string, string>; assets: string[] }): string {
  const { beat: b, beats } = o;
  const len = b.end - b.start;
  const prev = beats[o.index - 1];
  const next = beats[o.index + 1];
  const words = b.words.map((w) => `${w.text}@${w.at - b.start}`).join(" ");
  return `${o.context}

You are the agent for beat ${b.id} (${o.index + 1} of ${beats.length}) in a team: other agents write the other beats at the same time, and a lead wrote the foundation. You write ONLY ${beatFile(b.id)} (and helpers in scene/beats/${b.id}/). The shared files (theme, components, scene/index.tsx) are the lead's: read them, import them (from your file: "../theme", "../components/Name"), never change them.

Your beat is a station of <World>: a frame-sized place (W x H) on its own clock. useCurrentFrame() is 0 at your beat's start (film frame ${b.start}); the camera arrives in your first frames and moves on to the next station as the next beat begins. It lasts ${len} frames. Nothing fades out at its end: your station stays as you leave it${next ? "" : " (it is the last beat: hold the close calmly to the end)"}. useBeat().cue("word") is the frame (in your time) the voice says a word in your beat; useFilm() still gives the format, the brand and the whole film.

YOUR BEAT ${b.id}: says "${b.says}"; shows: ${b.shows}${b.voice ? `; voice${b.spoken ? " (recorded)" : " (not recorded: times are estimates)"}: "${b.voice}"; words (local frames): ${words}` : ""}
BEFORE YOU: ${prev ? `${prev.id} shows ${prev.shows}` : "nothing: you open the film, and your first frame is the thumbnail"}
AFTER YOU: ${next ? `${next.id} shows ${next.shows}` : "nothing: you close the film"}

THE LEAD'S NOTES:
${o.notes || "(none)"}

ASSETS ALREADY FETCHED (draw them with <Asset name=... />; never fetch them again): ${o.assets.join(", ") || "none"}

SHARED FILES:
${Object.entries(o.shared)
  .map(([p, src]) => `--- ${p} ---\n${src}`)
  .join("\n\n")}

Your file starts as the studio's baseline for this beat (it already shows the words; \`read_file\` it): make it this concept's moment, never thinner than the baseline.

Work in few replies (at most 8): write your file, \`check\`, \`contact_sheet\` (your stretch and the seams with your neighbours), fix everything you see and every QA warning, render again, then \`finish\` with one line on what you built.`;
}

/** How many replies one designer gets to build a whole film. */
export const SOLO_STEPS = 24;

/** One designer builds the whole film, as in their own IDE: one mind, one conversation, many looks. */
export function soloTask(o: { context: string; beats: Beat[] }): string {
  return `${o.context}

You build this whole film yourself, from the first frame to the last, in at most ${SOLO_STEPS} replies. Plan the budget: about a third to build, the rest to look and fix.

${BASELINE_NOTE}

1. Call \`timing\` once (the beats in frames), \`read_file\` the baseline's files, and \`contact_sheet\` to see where you start. Fetch the logos the film needs in one reply, before you write code; never fetch the same image twice.
2. Rewrite scene/theme.ts, the components and scene/index.tsx into this concept's world, at most 3 files per reply. Each beat (${o.beats.map((b) => b.id).join(", ")}) is a station in ${beatFile("<id>")}, rendered by \`<World of={BEATS} />\` in scene/index.tsx (\`import { BEATS } from "./beats"\`; ${BEATS_INDEX} is generated, never write it): set its layout and move from the concept's camera, and put the story device that carries across beats in its children. Rewrite every beat file into its own moment.
3. \`check\` in the reply that writes the last file, fix every error.
4. \`contact_sheet\` of the whole film, then look like an art director: is every beat filled and showing its "says"? collisions, contrast (logos and text clearly readable), empty halves of the frame, slides instead of one world, the concept's look. Fix everything in one reply, render again. At least three look-and-fix passes; use \`render_frames\` to look closely at a beat.
5. \`finish\` only when the film is genuinely good.`;
}

/** The lead's task when the whole film does not pass the check: fix those errors and nothing else. */
export function repairTask(errors: string[]): string {
  return `The film does not pass the check, so it cannot play. Fix exactly these errors in a few replies, change nothing else, call \`check\` until it passes, then \`finish\`:
${errors
  .slice(0, 12)
  .map((e) => `- ${e}`)
  .join("\n")}
A name declared twice in one file: keep one declaration and delete the other. A name that is missing: import it or define it.`;
}

/** What the beat agents are told when the foundation never passed the check and was dropped. */
export const NO_FOUNDATION = "The lead's foundation did not pass the check and was dropped: the stage and theme are the studio's baseline (scene/index.tsx, scene/theme.ts) and there are no shared components. Build your beat with the kit and the baseline theme, in the concept's palette and type.";

export const LEAD_INTEGRATE = `All beats are written by their agents. Now make it one film:
1. \`contact_sheet\` for the whole film.
2. Fix the seams between stations (the camera's moves, what carries from one station to the next), consistency (type sizes, colours, positions of recurring things), overlaps and every QA warning. You may edit any file now, beats included, except ${BEATS_INDEX}.
3. Render again what you changed, then \`finish\`.`;

/** Replies the designer gets to carry out one note on a finished film. */
export const REVISE_NOTE_STEPS = 14;

/** The designer's task for a note on a finished film: change what the editor planned, keep the rest. */
export function reviseTask(o: { context: string; note: string; summary: string; design: string; targets: string[]; locked: string[]; broken: string[]; changedBeats: string[] }): string {
  return `${o.context}

The film above is FINISHED and its files are in scene/ (read what you change before you change it). The person wrote a note about it, and the editor turned the note into a plan. Carry out the plan by editing the existing files: keep every part that the plan does not mention exactly as it is (layouts, components, timings, colours, words). This is a revision, not a new film: a film made before the one-world stage may play its beats with <Beats>; keep its stage as it is unless the plan asks to change it.

THE NOTE: ${o.note}
THE PLAN: ${o.summary}
Where the note and the plan disagree on a number, a price or a word, the note wins: put the note's figures on screen exactly as it writes them (they are in the facts).
WHAT TO CHANGE IN THE CODE:
${o.design || "(nothing beyond the beats listed below)"}
${o.targets.length ? `ONLY THESE BEATS: ${o.targets.join(", ")}. Leave every other beat's code alone.` : ""}
${o.changedBeats.length ? `BEATS WHOSE WORDS, LINE OR LENGTH CHANGED (\`timing\` has their new frames and words): ${o.changedBeats.join(", ")}. Make their on-screen words and cues match.` : ""}
${o.broken.length ? `CUES THAT NO LONGER FIND THEIR BEAT OR WORD (fix every one, or the film stops on it):\n${o.broken.map((b) => `- ${b}`).join("\n")}` : ""}
LOCKED (the person asked these not to change): ${o.locked.length ? o.locked.join(", ") : "nothing"}.

Work in few replies: \`timing\` if beats changed, read the files you change, edit them, \`check\`, then \`render_frames\` or \`contact_sheet\` of the beats you changed and compare with what the note asked. Fix what you see, then \`finish\` with one line on what changed.`;
}
