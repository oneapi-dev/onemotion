import type { Music, Plan } from "../engine/plan";
import { LIBRARY, type LibraryTrack } from "./library";
import { hashOf } from "./rng";

/** The built-in tracks that suit each of the director's music moods. */
const BY_MOOD: Record<Music, string[]> = {
  bright: ["advertime", "inspiration", "adding-the-sun", "inventing-flight"],
  drive: ["final-step", "funky-energy", "driving-concern", "beat-one"],
  calm: ["meditating-beat", "planeteer-reaction", "starcourt-mall", "motions"],
  pulse: ["beat-one", "screen-saver", "hear-what-they-say", "funky-energy"],
  epic: ["kings-trailer", "motions", "driving-concern", "final-step"],
};

/**
 * The built-in track a template video plays: one that suits its music mood,
 * varied by its angle so takes of the same brief differ. A plan whose score
 * the director wrote keeps the composer.
 */
export function trackOf(plan: Pick<Plan, "angle" | "music" | "scenes"> & { score?: unknown }): LibraryTrack | null {
  if (plan.score !== undefined) return null;
  const ids = BY_MOOD[plan.music] ?? LIBRARY.map((t) => t.id);
  const id = ids[hashOf(`${plan.angle}|${plan.scenes.length}|track`) % ids.length];
  return LIBRARY.find((t) => t.id === id) ?? null;
}
