import type { CameraPath, LookName, MotionFormat, Music, Tone } from "@/engine/plan";

/** What was read from the website a brief names, when it names one. */
export type SiteInfo = {
  url: string;
  domain: string;
  name: string;
  title: string;
  description: string;
  lang: string;
  headings: string[];
  paragraphs: string[];
  ctas: string[];
  /** The site's brand color (theme color), "#rrggbb" or "". */
  accent: string;
  fonts?: { display?: string; body?: string };
  /** The logo as a data: URL, small enough to keep in a plan's project. */
  logo: string | null;
};

/** A model from OneAPI's public catalog. */
export type CatalogModel = {
  id: string;
  name: string;
  tagline: string;
  contextWindow: string;
  capabilities: string[];
  /** Prices per 1M tokens as decimal strings; list* is the vendor's own rate. */
  inputPrice: string;
  outputPrice: string;
  listInput: string;
  listOutput: string;
  currency: string;
  free: boolean;
};

/** How one earlier video looked and sounded. */
export type Recent = { look: LookName; path: CameraPath; music: Music; angle?: string; tone?: Tone; scenes?: string[] };

/** Everything the director is told. */
export type DirectInput = {
  /** The person's brief, in their own words. */
  prompt: string;
  format: MotionFormat;
  /** "auto" or a tone the person picked. */
  tone: Tone | "auto";
  site?: SiteInfo | null;
  shots?: { kind: string; heading: string }[];
  /** Catalog models the brief names, with their real prices. */
  models?: CatalogModel[];
  /** A few real model ids, for code in a video that names none. */
  knownModels?: string[];
  /** The take being replaced: the new one must differ from it. */
  previous?: Recent;
  /** The person's latest other videos, newest first. */
  recent?: Recent[];
  /** Nudges the model toward a different structure on each call. */
  variation?: number;
  /** An edit keeps the plan's own brand color. */
  keepBrandColor?: boolean;
  /** Write a voiceover line for every scene. */
  narration?: boolean;
};
