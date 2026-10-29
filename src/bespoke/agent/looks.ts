/**
 * What each look needs beyond the shared prompt: its visual rules and the
 * kit blocks made for it. A guide reaches the motion designer only when the
 * concept picks that look (look.direction names it), so twelve looks do not
 * cost every film twelve guides. Distilled from the iart-ai, charlie947 and
 * makevoid motion skills (scratchpad research, 2026-10-29).
 */

export type LookGuide = { name: string; guide: string };

export const LOOK_GUIDES: LookGuide[] = [
  {
    name: "Kinetic editorial",
    guide: `KINETIC EDITORIAL: a magazine cover that moves, between Editorial light (calm) and Kinetic type (a word every beat).
- Paper ground (#F4F1EA or the brand's light), ink #14110F and one accent. Three or four words a scene, each scene 1 to 1.5 s; the words fill the width.
- One line mixes faces on purpose: a heavy condensed word in caps (Anton or Archivo Black, line height 0.86, tracking -0.02em), a soft italic serif word (Fraunces or Instrument Serif italic), and at most one outlined word (WebkitTextStroke 2.5 px in the ink, transparent fill). A small kicker in Inter 900 caps with letter spacing 0.45em sits above (indent it by the same 0.45em so it centres).
- Words arrive with <Chars mode="rise" order="center"> for the big word and order="start" for the rest; exits leave from the edges (order="edges", reversed). Hold each line 0.6 s still before it moves on.
- Scenes change with a hard cut or a short whip, never a fade. No pictures needed; one accent word per scene at most.`,
  },
  {
    name: "Risograph print",
    guide: `RISOGRAPH PRINT: a two-colour poster from a small print shop.
- Paper #F1EAD9 under <RisoPaper> (speckle grain, on twos). Exactly two spot inks: the brand accent and one deep ink (e.g. #2B3A7A); where they overlap, use the pre-mixed third colour riso.overlap(a, b). No other colours, no gradients.
- Type: one heavy grotesk or condensed face, knocked out: knockout(size, paper) gives a paper-coloured outline under the fill. Every inked word or shape sits in <Misprint ghost={secondInk}>{(ink) => <div style={{ color: ink ?? firstInk }}>…</div>}</Misprint> so its second ink lands a little off-register (the function is called once per print with that print's ink).
- Motion on twos: tt = onTwos(t) for every animated value (each pose held 2 frames). Stickers slap on: slap(tt, at) (scale 1.18 to 1, a small settle, 7 frames). Hard cuts on phrases.`,
  },
  {
    name: "Keynote UI morph",
    guide: `KEYNOTE UI MORPH: the product's own buttons and cards turn into each other, like an Apple keynote. No slides.
- Ground #F5F5F7 or one flat wallpaper colour per scene; no glass, no glow. The product's UI font, tight and heavy; one caption per scene with its last one or two words in a lighter tint of the wallpaper.
- Every scene is ONE object changing shape (a button grows into a player, a card into a workspace, a tab pill stretches): <Shell t at from={{x,y,w,h,r}} to={{x,y,w,h,r}} dur>{contents}</Shell> grows by clip-path with rounded corners and never scales its contents. The old contents fade out in the first 25 % of the move; the new ones appear after 50 % (Shell's \`old\` and \`next\` props do this). A shared element moves; it is never drawn twice. Leave a faint ghost of the start state at its origin for a few frames.
- Depth: <Tilt t at ry={-14} rx={6} style={{ position, left, top, width, height }}> turns ONE card-sized element in depth (drawn in 2D; never CSS perspective, which vanishes in the export) and settles it flat as it lands. Wrap the card, not the whole frame; one tilt per scene, under 20 degrees.
- Springs open softly and close without overshoot (calm or balanced pace).`,
  },
  {
    name: "Paper documentary",
    guide: `PAPER DOCUMENTARY: a YouTube documentary look for "why" explainers.
- Cream #F1E6D0 and paper #FBF7EE with <Halftone> dots, grain and a soft vignette. Three colours and one accent (red #B8312A, navy #14213D, yellow #F2C230 by default; the brand's when it has them).
- Captions are bold condensed type in three-line blocks on <TornStrip seed> paper strips (a seeded torn edge, a small shadow). Colour fringing only at the frame's edges (a red/cyan text-shadow on type near the edge).
- Motion on twos (tt = onTwos(t)): paper cards drop with small shadows, a date chip flips before/after, a marker circle calls out the detail, a counter counts, a grid of identical tiles where one breaks the pattern. One of these per beat.`,
  },
  {
    name: "Data newsroom",
    guide: `DATA NEWSROOM: the chart is the star, like a business newspaper graphic.
- Off-white ground, hairline grid, every series grey (#BDB8AE) and ONE in the accent (the one the beat is about). The headline is a claim in a serif ("Riders tripled after swell alerts", not "Riders"); a small mono source line at the bottom. Figures in tabular numbers through fmtNum (locale "id-ID" for an Indonesian film).
- Blocks: <LineChart ... axis area callout={{ index, text }} locale> (axes draw first, the area fills after the line, one callout at the inflection); <RankRace t at rows={[{ label, values: { key: n } }]} w h highlight color grey ink font perRow={45} hold={75} top={8} /> for a ranking over time (raceLength(rows) frames); <BarChart ... locale> for one snapshot; <Callout t event x y text ... /> inside an <svg> for a custom chart.
- Pacing: the axes and units 1 to 1.5 s before any value moves, 0.3 to 0.6 s a data row, slow down at the key moment, the final state held 2 to 3 s. One number counts at a time; a counted number holds at least 0.5 s. The chart fills 60 to 80 % of the width; labels at least 28 px.`,
  },
  {
    name: "Pictogram",
    guide: `PICTOGRAM: stats as rows of little icons.
- A flat light ground, one icon family, the counted share lit in the accent and the rest dim at 0.25; one big number or a short claim beside or above them. A single share can be a ring.
- Blocks: <Pictogram t at value={7} total={10} icon="person"|"house"|"drop"|"bolt"|"<24x24 path d>" cols size color base step={3} /> (a fractional value reveals the last unit with a clip, never a scale); <RingStat t at value={0.64} size color track ink font label unit="%" /> (the arc and the counter move together).
- The grid fills 60 to 80 % of the width (size the icons from W). Units light 3 frames apart; hold the lit state at least 1 s before the next idea; one stat per beat.`,
  },
  {
    name: "Whiteboard",
    guide: `WHITEBOARD: a marker draws the explanation, one thing at a time, as the voice says it.
- Off-white board (#FBFBF8), black marker and one accent marker that means emphasis; one handwriting face (Caveat) for labels, one clean sans for numbers. Sparse: one drawing per beat, never clip-art.
- <Pen t at strokes={[{ d, color?, width?, fill?, label?: { text, x, y, size? }, dur?, hold?, dash? }]} w h hand="marker"|"pencil"|"none" /> draws each element outline, then fill, then label, the nib riding the stroke; a stroke with no d only writes its label; hold: 0 chains strokes into one element (an arrow's shaft and head). penTimes(strokes, { at }) gives each element's start, end and label frames: put the voice's words and the Sfx "marker" on them.
- Strokes at an even speed; the board holds still 0.6 s after each element; the next section starts on a clean board (a hard cut, or the camera moves on).`,
  },
  {
    name: "Living diagram",
    guide: `LIVING DIAGRAM: how the parts connect, lit up step by step.
- White or paper ground, hairlines, grey ink (#8E8E89) for every node and edge, ONE accent for the active path; mono labels (at least 28 px), a grotesk for node names.
- <Flow t at nodes={[{ id, label, sub?, x, y }]} edges={[[from, to] | { from, to, label?, elbow? }]} focus={[[frame, ["a", "a>b", "b"]]]} w h ink accent paper font mono pulse={48} /> builds nodes, then edges, then labels (flowPlan(n, e, { at }) gives the frames), dims everything not in focus to 0.35 over 9 frames, and runs a pulse along the lit path. Time each focus step to the word the voice says (cue).
- Reveal in order, never all at once; hold each step 0.5 to 1.5 s; give the last beat pulse={false} so the film ends at rest. The diagram fills 60 to 80 % of the width.`,
  },
  {
    name: "Editorial map",
    guide: `EDITORIAL MAP: a calm news-style map, offline world data built in.
- Cream (#F3EEE4) or deep slate ground, land a muted tint at 0.35, hairline borders, ONE accent for routes, pins and the highlighted country (a colour keeps one meaning for the whole film); labels in a mono face, headlines in a serif or grotesk.
- <MapStage t view="world"|[w,s,e,n] cam={[[frame, { lng, lat, zoom } | { fit: "AUS" | [w,s,e,n] }, ease?]]} highlight={[{ id: "AUS", at, color? }]} pins={[{ lng, lat, label, sub?, at }]} routes={[{ path: [[lng, lat], ...], at, dur?, arc? }]} ground land line accent ink font mono stepped /> is the beat's full-frame hero: put it FIRST in the beat, under the words. cam keys fly in log space (a long hop pulls out, then in); fit frames a country or a box. Labels are cut to two words and keep their size at any zoom. useMap() inside it gives px(lng, lat) for your own overlays.
- One map for the film: keep the same MapStage across beats (the scene's stage) and move its camera, rather than a new map per station (use World move="cut" or one full-frame stage). Pins 4 to 8 frames apart, a route at least 36 frames, the camera 1.2 to 2 s a hop; hold 1 s on each arrival. A route over a highlighted country uses a tint highlight or ink, or it disappears. In portrait, use a box view or a zoom, never the whole world.`,
  },
  {
    name: "Isometric model",
    guide: `ISOMETRIC MODEL: the system as a small tidy model seen from above (2D projection, no CSS 3D).
- Warm light grey ground (#E9E6E0) with a faint iso grid; one hue for the blocks (faces shaded top lighter, left base, right darker, done for you), the accent only on the block that is active now; a geometric grotesk for labels.
- <IsoScene w h u ox oy t drift> holds the model; put <IsoGrid/>, <IsoPath points t at/>, <IsoBlock x y z w d h color t at from="rise"|"drop"|"grow" label top={<real UI>}/> and <IsoPacket points t at every color/> inside it directly (it sorts them back to front: the renderer ignores z-index). <IsoExplode t at back gap>{blocks bottom to top}</IsoExplode> opens a stack into its layers and closes it; <IsoPlane x y z w d>{DOM}</IsoPlane> lays real UI flat on a floor or top face. isoBuild(blocks, at) times a build bottom-up 4 frames apart.
- Size it: choose u so the model fills 60 to 80 % of the frame width (u is px per cell). Height is shown by lifting, never by scaling; drift by translate only, never rotate the plane. One step of the story per beat: build, a packet travels, a layer opens, the phone lights.`,
  },
  {
    name: "Math blackboard",
    guide: `MATH BLACKBOARD: shapes and numbers that draw themselves, like a great maths teacher.
- Deep charcoal (#1B1E24) or navy board, chalk-white ink, at most two colours and each means one quantity for the whole film (h is always amber, x always pale blue). A serif for formulas, Inter for small labels. No glow.
- <Plot t at xs ys w h fn|data grid ticks labels track readout tangent area drop ink color color2 font /> grows the axes, then the grid (dimmed to 0.55), then plots the curve left to right with a tracer whose readout comes from the same value. <FormulaSteps t steps={[[{ s, k?, c?, sup?, sub? }...], ...]} at={[f0, f1, ...]} colors size font ink /> builds an equation token by token and transforms it between steps: tokens with the same key glide to their new place, new ones rise, removed ones fade (<Formula> for one form). <Morph t at from to w h color fill spin /> turns one path into another, only when it is the same thing changing state.
- Size: the plot or the formula fills 60 to 80 % of the width; formulas at least 96 px. One idea per beat; hold each new form 1 s before the next step; a slow push-in on the detail is the only camera move.`,
  },
];

/** The guides for the look a concept picked (its direction names one or two looks), joined for the agents' task. */
export function lookGuides(direction: string): string {
  const d = direction.toLowerCase();
  const picked = LOOK_GUIDES.filter((g) => d.includes(g.name.toLowerCase()));
  return picked.map((g) => g.guide).join("\n\n");
}
