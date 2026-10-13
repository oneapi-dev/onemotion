/** The sound effects a scene can place (files in public/audio). */
export const SFX = ["whoosh", "swoosh", "impact", "riser", "tick", "pop", "ding", "type", "click"] as const;
export type SfxName = (typeof SFX)[number];
