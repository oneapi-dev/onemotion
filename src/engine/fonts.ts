import { loadFont as archivo } from "@remotion/google-fonts/Archivo";
import { loadFont as bricolage } from "@remotion/google-fonts/BricolageGrotesque";
import { loadFont as dmSans } from "@remotion/google-fonts/DMSans";
import { loadFont as fraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as geist } from "@remotion/google-fonts/Geist";
import { loadFont as inter } from "@remotion/google-fonts/Inter";
import { loadFont as interTight } from "@remotion/google-fonts/InterTight";
import { loadFont as instrumentSerif } from "@remotion/google-fonts/InstrumentSerif";
import { loadFont as lora } from "@remotion/google-fonts/Lora";
import { loadFont as manrope } from "@remotion/google-fonts/Manrope";
import { loadFont as montserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as outfit } from "@remotion/google-fonts/Outfit";
import { loadFont as playfair } from "@remotion/google-fonts/PlayfairDisplay";
import { loadFont as plusJakarta } from "@remotion/google-fonts/PlusJakartaSans";
import { loadFont as poppins } from "@remotion/google-fonts/Poppins";
import { loadFont as sora } from "@remotion/google-fonts/Sora";
import { loadFont as spaceGrotesk } from "@remotion/google-fonts/SpaceGrotesk";
import { loadFont as syne } from "@remotion/google-fonts/Syne";
import { loadFont as geistMono } from "@remotion/google-fonts/GeistMono";

/**
 * The faces the director may pick (src/director/rules.ts lists the same
 * names). Each loads only when a plan uses it, and only the weights the
 * template draws with.
 */
type Loader = (style?: "normal", opts?: { weights?: string[]; subsets?: string[] }) => { fontFamily: string };

const LOADERS: Record<string, { load: Loader; weights: string[]; serif?: boolean }> = {
  Inter: { load: inter as Loader, weights: ["400", "500", "600", "700", "800"] },
  "Inter Tight": { load: interTight as Loader, weights: ["500", "600", "700", "800"] },
  "Plus Jakarta Sans": { load: plusJakarta as Loader, weights: ["400", "500", "600", "700", "800"] },
  "DM Sans": { load: dmSans as Loader, weights: ["400", "500", "600", "700"] },
  "Space Grotesk": { load: spaceGrotesk as Loader, weights: ["400", "500", "600", "700"] },
  Poppins: { load: poppins as Loader, weights: ["400", "500", "600", "700", "800"] },
  Montserrat: { load: montserrat as Loader, weights: ["400", "500", "600", "700", "800"] },
  "Bricolage Grotesque": { load: bricolage as Loader, weights: ["500", "600", "700", "800"] },
  Geist: { load: geist as Loader, weights: ["400", "500", "600", "700", "800"] },
  Manrope: { load: manrope as Loader, weights: ["400", "500", "600", "700", "800"] },
  Outfit: { load: outfit as Loader, weights: ["400", "500", "600", "700", "800"] },
  Syne: { load: syne as Loader, weights: ["500", "600", "700", "800"] },
  Sora: { load: sora as Loader, weights: ["400", "500", "600", "700", "800"] },
  Archivo: { load: archivo as Loader, weights: ["400", "500", "600", "700", "800"] },
  Lora: { load: lora as Loader, weights: ["400", "500", "600", "700"], serif: true },
  "Playfair Display": { load: playfair as Loader, weights: ["500", "600", "700", "800"], serif: true },
  Fraunces: { load: fraunces as Loader, weights: ["400", "500", "600", "700"], serif: true },
  "Instrument Serif": { load: instrumentSerif as Loader, weights: ["400"], serif: true },
};

const loaded = new Map<string, string>();

/** Loads a face (once) and returns its CSS font-family. */
export function loadFace(name: string, fallback = "Inter"): { family: string; serif: boolean } {
  const key = LOADERS[name] ? name : fallback;
  const entry = LOADERS[key];
  let family = loaded.get(key);
  if (!family) {
    family = entry.load("normal", { weights: entry.weights, subsets: ["latin"] }).fontFamily;
    loaded.set(key, family);
  }
  return { family, serif: Boolean(entry.serif) };
}

let monoFamily: string | null = null;
export function monoFont(): string {
  if (!monoFamily) monoFamily = geistMono("normal", { weights: ["500"], subsets: ["latin"] }).fontFamily;
  return monoFamily;
}
