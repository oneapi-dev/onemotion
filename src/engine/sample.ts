import type { VideoInput } from "./plan";

/** Default props for Remotion Studio and type checks. Real renders pass their own. */
export const SAMPLE_INPUT: VideoInput = {
  format: "landscape",
  brand: { name: "OneAPI", domain: "oneapi.id", logo_src: null },
  shots: [],
  plan: {
    angle: "A new model lands on OneAPI at half the official price.",
    archetype: "announcement",
    brand: "OneAPI",
    look: "midnight",
    path: "dolly",
    tone: "punchy",
    caption: "MiMo V2.6 Flash is now on OneAPI.",
    fonts: { display: "Plus Jakarta Sans", body: "Inter" },
    music: "drive",
    scenes: [
      { type: "hook", duration: 2.6, title: "New model. Half the price." },
      { type: "announce", duration: 4, eyebrow: "NEW MODEL", title: "MiMo V2.6 Flash", body: "Now on OneAPI with a 1M token context.", items: [{ title: "Chat" }, { title: "Reasoning" }, { title: "Vision" }] },
      {
        type: "specs",
        duration: 4,
        title: "Price per 1M tokens",
        items: [
          { title: "Input", body: "$0.07" },
          { title: "Output", body: "$0.14" },
          { title: "Context", body: "1M" },
          { title: "Free tier", body: "Yes" },
        ],
      },
      { type: "cta", duration: 3.2, title: "Try it now", body: "oneapi.id" },
    ],
  },
};
