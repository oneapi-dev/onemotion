import type { Music, Plan } from "../engine/plan";
import { LIBRARY, type LibraryTrack } from "./library";
import { hashOf } from "./rng";

/** The fastest tempo a template video plays (see trackOf). */
export const QUICK_MAX_BPM = 122;

/** The built-in tracks that suit each of the director's music moods. */
export const BY_MOOD: Record<Music, string[]> = {
  bright: ["advertime", "inspiration", "adding-the-sun", "inventing-flight", "fresh-focus", "city-sunshine", "energizing", "natural-vibes", "and-just-like-that", "pond", "happy-whistling-ukulele"],
  drive: ["final-step", "funky-energy", "driving-concern", "beat-one", "goodnightmare", "groovin", "funkeriffic", "hold-on-a-sec", "release-the-hybrids", "spec-ops", "action-strike", "patron-saint-of-heists"],
  calm: ["meditating-beat", "planeteer-reaction", "starcourt-mall", "motions", "wisdom-in-the-sun", "study-and-relax", "kalimba-relaxation", "bass-meant-jazz", "mana-two", "ice-and-snow", "compy-jazz", "infinite-wonder"],
  pulse: ["beat-one", "screen-saver", "hear-what-they-say", "funky-energy", "abstract-anxiety", "blippy-trance", "experimental-test-subject", "shenzhen-nightlife", "modern-island-jam", "gotta-keep-on-movin"],
  epic: ["kings-trailer", "motions", "driving-concern", "final-step", "heroic-adventure", "hit-n-smash", "go-on-without-me", "romantic-inspiration", "think-about-it", "dreams-of-vain"],
};

/**
 * The built-in track a template video plays: one that suits its music mood,
 * varied by its angle so takes of the same brief differ. A plan whose score
 * the director wrote keeps the composer.
 */
export function trackOf(plan: Pick<Plan, "angle" | "music" | "scenes"> & { score?: unknown }): LibraryTrack | null {
  if (plan.score !== undefined) return null;
  // The template camera (engine/rig) jumps a few pixels as it leaves a card at 123 BPM and faster: its pools stay below.
  const slow = (id: string) => (LIBRARY.find((t) => t.id === id)?.bpm ?? 0) < QUICK_MAX_BPM;
  const ids = (BY_MOOD[plan.music] ?? LIBRARY.map((t) => t.id)).filter(slow);
  const id = ids[hashOf(`${plan.angle}|${plan.scenes.length}|track`) % ids.length];
  return LIBRARY.find((t) => t.id === id) ?? null;
}
