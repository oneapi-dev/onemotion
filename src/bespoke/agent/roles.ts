import type { Beat } from "../kit/film";
import { BEATS_INDEX, beatFile } from "./parallel";

/**
 * The tasks of a team building one film: the lead's foundation, each beat
 * agent's beat, and the lead's pass joining them up. They share the
 * system prompt (the craft, the rules, the kit); these say who does what.
 */

export const OVERLAP = 10;

export function leadFoundationTask(o: { context: string; beats: Beat[] }): string {
  return `${o.context}

You are the LEAD of a small team building this film. Its beats (${o.beats.map((b) => b.id).join(", ")}) are written IN PARALLEL by one agent each, in ${beatFile("<id>")}. You do not write beats. Your job now is the foundation every beat builds on, in at most 4 replies:

1. Call \`timing\`.
2. scene/theme.ts: the palette, fonts, type scale, spacing, stroke widths and motion constants as exported constants, and the layout regions or camera stations the beats use.
3. scene/components/*.tsx: the shared pieces the beats reuse: the background world, recurring metaphor objects, a headline style, the brand lockup for the close.
4. scene/index.tsx: export \`fonts\` and \`background\`, render the persistent stage (background, the world, the camera if the film flies through one) and \`<Beats of={BEATS} overlap={${OVERLAP}} />\` from @kit (\`import { BEATS } from "./beats"\`) where the beats belong in it. Transitions between beats belong to the stage. ${BEATS_INDEX} is generated: never write it.
5. \`check\`, then \`finish\` with NOTES FOR THE BEAT AGENTS: for every beat, where its content sits (a region in px, or the camera station), what to import from theme and components, how it enters and how it exits to meet its neighbours. Be concrete: px, component names, frames.

The beat files are stubs for now (they render nothing), so your renders show only the stage. Keep the foundation small and solid: the beat agents carry the content.`;
}

export function beatTask(o: { context: string; beat: Beat; index: number; beats: Beat[]; notes: string; shared: Record<string, string> }): string {
  const { beat: b, beats } = o;
  const len = b.end - b.start;
  const prev = beats[o.index - 1];
  const next = beats[o.index + 1];
  const words = b.words.map((w) => `${w.text}@${w.at - b.start}`).join(" ");
  return `${o.context}

You are the agent for beat ${b.id} (${o.index + 1} of ${beats.length}) in a team: other agents write the other beats at the same time, and a lead wrote the foundation. You write ONLY ${beatFile(b.id)} (and helpers in scene/beats/${b.id}/). The shared files (theme, components, scene/index.tsx) are the lead's: read them, import them (from your file: "../theme", "../components/Name"), never change them.

Your beat renders inside <Beats>: useCurrentFrame() is 0 at your beat's start (film frame ${b.start}). It lasts ${len} frames, plus ${OVERLAP} frames of overlap into the next beat for your exit${next ? "" : " (it is the last beat: hold the close calmly to the end)"}. useBeat().cue("word") is the frame (in your time) the voice says a word in your beat; useFilm() still gives the format, the brand and the whole film.

YOUR BEAT ${b.id}: says "${b.says}"; shows: ${b.shows}${b.voice ? `; voice${b.spoken ? " (recorded)" : " (not recorded: times are estimates)"}: "${b.voice}"; words (local frames): ${words}` : ""}
BEFORE YOU: ${prev ? `${prev.id} shows ${prev.shows}` : "nothing: you open the film, and your first frame is the thumbnail"}
AFTER YOU: ${next ? `${next.id} shows ${next.shows}` : "nothing: you close the film"}

THE LEAD'S NOTES:
${o.notes || "(none)"}

SHARED FILES:
${Object.entries(o.shared)
  .map(([p, src]) => `--- ${p} ---\n${src}`)
  .join("\n\n")}

Work in few replies (at most 8): write your file, \`check\`, \`contact_sheet\` (your stretch and the seams with your neighbours), fix everything you see and every QA warning, render again, then \`finish\` with one line on what you built.`;
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
export const NO_FOUNDATION = "The lead's foundation did not pass the check and was dropped. There is no theme and there are no shared components: build your beat with the kit alone, on the plain stage in scene/index.tsx, in the concept's palette and type.";

export const LEAD_INTEGRATE = `All beats are written by their agents. Now make it one film:
1. \`contact_sheet\` for the whole film.
2. Fix the seams between beats (an exit meeting the next entry), consistency (type sizes, colours, positions of recurring things), overlaps and every QA warning. You may edit any file now, beats included, except ${BEATS_INDEX}.
3. Render again what you changed, then \`finish\`.`;
