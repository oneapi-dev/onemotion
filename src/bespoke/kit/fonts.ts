/**
 * The faces a bespoke scene may use. It declares them
 * (`export const fonts = { "Space Grotesk": ["500", "700"] }`); only those
 * load, and the film waits for them before its first frame, because text is
 * measured with them.
 */

type Loader = (style?: "normal", opts?: { weights?: string[]; subsets?: string[]; ignoreTooManyRequestsWarning?: boolean }) => { fontFamily: string; waitUntilDone: () => Promise<void> };
type FontModule = { loadFont: Loader; getInfo: () => { fonts: Record<string, Record<string, unknown>> } };

const FONTS: Record<string, () => Promise<FontModule>> = {
  Unbounded: () => import("@remotion/google-fonts/Unbounded") as Promise<FontModule>,
  Onest: () => import("@remotion/google-fonts/Onest") as Promise<FontModule>,
  "Azeret Mono": () => import("@remotion/google-fonts/AzeretMono") as Promise<FontModule>,
  Sora: () => import("@remotion/google-fonts/Sora") as Promise<FontModule>,
  Inter: () => import("@remotion/google-fonts/Inter") as Promise<FontModule>,
  "Inter Tight": () => import("@remotion/google-fonts/InterTight") as Promise<FontModule>,
  "JetBrains Mono": () => import("@remotion/google-fonts/JetBrainsMono") as Promise<FontModule>,
  "Bricolage Grotesque": () => import("@remotion/google-fonts/BricolageGrotesque") as Promise<FontModule>,
  Geist: () => import("@remotion/google-fonts/Geist") as Promise<FontModule>,
  "Geist Mono": () => import("@remotion/google-fonts/GeistMono") as Promise<FontModule>,
  Syne: () => import("@remotion/google-fonts/Syne") as Promise<FontModule>,
  "Hanken Grotesk": () => import("@remotion/google-fonts/HankenGrotesk") as Promise<FontModule>,
  "Fragment Mono": () => import("@remotion/google-fonts/FragmentMono") as Promise<FontModule>,
  "Space Grotesk": () => import("@remotion/google-fonts/SpaceGrotesk") as Promise<FontModule>,
  "Space Mono": () => import("@remotion/google-fonts/SpaceMono") as Promise<FontModule>,
  Manrope: () => import("@remotion/google-fonts/Manrope") as Promise<FontModule>,
  "IBM Plex Mono": () => import("@remotion/google-fonts/IBMPlexMono") as Promise<FontModule>,
  "Archivo Black": () => import("@remotion/google-fonts/ArchivoBlack") as Promise<FontModule>,
  Archivo: () => import("@remotion/google-fonts/Archivo") as Promise<FontModule>,
  "DM Mono": () => import("@remotion/google-fonts/DMMono") as Promise<FontModule>,
  "DM Sans": () => import("@remotion/google-fonts/DMSans") as Promise<FontModule>,
  "Instrument Serif": () => import("@remotion/google-fonts/InstrumentSerif") as Promise<FontModule>,
  "Instrument Sans": () => import("@remotion/google-fonts/InstrumentSans") as Promise<FontModule>,
  Fraunces: () => import("@remotion/google-fonts/Fraunces") as Promise<FontModule>,
  "Playfair Display": () => import("@remotion/google-fonts/PlayfairDisplay") as Promise<FontModule>,
  Newsreader: () => import("@remotion/google-fonts/Newsreader") as Promise<FontModule>,
  Lora: () => import("@remotion/google-fonts/Lora") as Promise<FontModule>,
  Anton: () => import("@remotion/google-fonts/Anton") as Promise<FontModule>,
  "Bebas Neue": () => import("@remotion/google-fonts/BebasNeue") as Promise<FontModule>,
  Oswald: () => import("@remotion/google-fonts/Oswald") as Promise<FontModule>,
  Caveat: () => import("@remotion/google-fonts/Caveat") as Promise<FontModule>,
  Kalam: () => import("@remotion/google-fonts/Kalam") as Promise<FontModule>,
  "Architects Daughter": () => import("@remotion/google-fonts/ArchitectsDaughter") as Promise<FontModule>,
  "Permanent Marker": () => import("@remotion/google-fonts/PermanentMarker") as Promise<FontModule>,
  "Shadows Into Light": () => import("@remotion/google-fonts/ShadowsIntoLight") as Promise<FontModule>,
  Fredoka: () => import("@remotion/google-fonts/Fredoka") as Promise<FontModule>,
  "Baloo 2": () => import("@remotion/google-fonts/Baloo2") as Promise<FontModule>,
  Montserrat: () => import("@remotion/google-fonts/Montserrat") as Promise<FontModule>,
  Poppins: () => import("@remotion/google-fonts/Poppins") as Promise<FontModule>,
  "Plus Jakarta Sans": () => import("@remotion/google-fonts/PlusJakartaSans") as Promise<FontModule>,
  Outfit: () => import("@remotion/google-fonts/Outfit") as Promise<FontModule>,
  Lexend: () => import("@remotion/google-fonts/Lexend") as Promise<FontModule>,
  Figtree: () => import("@remotion/google-fonts/Figtree") as Promise<FontModule>,
  Urbanist: () => import("@remotion/google-fonts/Urbanist") as Promise<FontModule>,
  "Rubik Mono One": () => import("@remotion/google-fonts/RubikMonoOne") as Promise<FontModule>,
  Bungee: () => import("@remotion/google-fonts/Bungee") as Promise<FontModule>,
  Righteous: () => import("@remotion/google-fonts/Righteous") as Promise<FontModule>,
};

export const FONT_NAMES = Object.keys(FONTS);

export type FontRequest = Record<string, string[]>;

/** Loads every requested face in the weights it has (the nearest one otherwise); resolves when they are ready to measure. */
export async function loadFonts(req: FontRequest): Promise<string[]> {
  const unknown: string[] = [];
  await Promise.all(
    Object.entries(req).map(async ([name, weights]) => {
      const get = FONTS[name];
      if (!get) {
        unknown.push(name);
        return;
      }
      const mod = await get();
      const have = Object.keys(mod.getInfo().fonts.normal ?? {}).map(Number);
      const want = (weights.length ? weights : ["400"]).map(Number).map((w) => (have.includes(w) ? w : have.reduce((a, b) => (Math.abs(b - w) < Math.abs(a - w) ? b : a), have[0])));
      await mod.loadFont("normal", { weights: [...new Set(want)].map(String), subsets: ["latin"], ignoreTooManyRequestsWarning: true }).waitUntilDone();
    }),
  );
  await document.fonts.ready;
  return unknown;
}
