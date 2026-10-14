/** The sound effects a scene can place (files in public/audio). */
export const SFX = ["whoosh", "swoosh", "impact", "sub", "riser", "tick", "pop", "ding", "type", "key", "click", "connect", "blip", "marker", "pencil", "success", "error", "notify", "glitch"] as const;
export type SfxName = (typeof SFX)[number];

/** What each one is, for the agent choosing it. */
export const SFX_USE: Record<SfxName, string> = {
  whoosh: "a camera move or big transition",
  swoosh: "a quick move, a slide, a model switch",
  impact: "a heavy hit with a tail (use rarely)",
  sub: "a clean sub-bass hit, weight without a boom",
  riser: "a build into a reveal (about 2 s before it)",
  tick: "a tiny tick: a label appearing, a step",
  pop: "something popping into place",
  ding: "a number or result landing",
  type: "1.5 s of typing",
  key: "one key press (type in step with the picture)",
  click: "a mouse click (Cursor plays it itself)",
  connect: "a connection snapping in: a line reaching a node",
  blip: "a tiny data pulse: a request, a packet, a token",
  marker: "a marker drawing on paper (0.7 s)",
  pencil: "a pencil sketching (0.45 s)",
  success: "a request done, a check passing",
  error: "a soft error tone: a failed call, a conflict",
  notify: "a notification arriving",
  glitch: "a short digital glitch (use rarely)",
};
