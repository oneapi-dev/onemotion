// The "Cinematic 2D story" look's guide: the aiTrends 2D Studio's own references (style bible, engine
// reference, story breakdown, QC checklist), kept nearly verbatim, after how they map into this studio.
// Generated from aitrends/skills/make-2d-video/references (gitignored reference copy) by hand-run script.

export const STUDIO2D_GUIDE = `CINEMATIC 2D STORY: the aiTrends 2D Studio look, ported into this studio. Every frame of every beat is drawn by the 2D studio engine on one canvas: black stick figures with rim light acting in moody 2.5D sets, giant face close-ups, freeze frames, animated numbers, blueprint explainers, low-poly 3D orbits. Its style bible, engine reference, story breakdown and QC checklist follow, after how they map here (where they differ, this mapping wins):
- Files. scene/index.tsx: \`<World of={BEATS} move="cut" push={0} open={0} />\` on a black div, \`export const fonts = { Fredoka: ["600", "700"], Nunito: ["800", "900"], "Playfair Display": ["900i"] }\`, \`export const background = "#000000"\`, \`export const captions = false\` (true in 9:16). scene/cast.ts: the story bible as a comment at its top (logline and tone, cast table, locations with mood and key light, motifs) and the outfits as exports (\`export const MAX = { top: "hoodie", color: "#d64a33", head: "none", ... }\`). scene/sets/<name>.ts: one function per location, like the engine's sets (draws sky, far, mid, floor and practical lights; returns { GY, M } with GY = E.H * V(0.8, 0.68) and M = mood(name)). Each beat file scene/beats/<id>.tsx default-exports a component returning \`<Studio2D style="dusk" shots={[...]} />\` (plus its <Sfx> cues beside it in a fragment): its shots in order, 2 to 5 a beat by the pacing rules, each \`{ id: "b3a", dur: 1.8, line: "the words spoken over it", in: { type: "cut" }, bars: "wide", draw(g, t, info) { ... } }\` (the last shot has no dur: it fills the beat) or a 3D shot \`{ id, kind: "3d", init(T, info) { ... return { stage } }, draw(s, t, info, T) { ... }, overlay(g, t, info, s) { ... } }\`.
- Imports. Only \`import { Studio2D, Sfx, s2, rig, fx2, ui2 } from "@kit";\` then \`const { E, V, S, mood, layer, blurLayer, veil, backdrop, ease, prog, key, clamp, lerp, rng, noise, shake, wordTime, talkAmount, glow, alpha, shade, mix, linGrad, radGrad, rr, seg, poly, circle, ring, fillRect, text, measure, FONTS } = s2; const { drawFigure, POSES, posesAt, blendPose, breathe, walkPose, face, bigFace, headPos } = rig; const FX = fx2; const UI = ui2;\`. The engine is untyped: type loose objects as any (\`o: any = {}\`, \`const pts: any[] = []\`).
- Time. Inside a draw, t is seconds into the shot and info.globalT is the film's clock in seconds; wordTime(word, afterGlobalT) answers from the recorded voice, so a number or label lands on the word that says it. The film runs at 30 fps; never use Math.random or Date.now (rng(seed) and t).
- One canvas a beat: never put DOM text, pictures or kit blocks over the Studio2D; all type is drawn by ui2 (titleCard, bigLine, badge, readout, callout, dataCard, compareBars, meter, blueprint, endScreen) or s2.text in the engine's FONTS. The QA reads the words the engine draws.
- Style: one of dusk (default), midnight, golden, neon, storybook for the whole film, the same in every beat; every colour from mood(), S() or the cast (S().ui.gold for key numbers, S().ui.accent for worrying values, S().ui.cream for labels). The first beat passes fadeIn={0.5}, the last fadeOut={0.8}.
- Not here: render.mjs, config.json, shots.json, the Python tools, Whisper and the audio mix of the original kit. This studio records the voice, times the words, scores the music and mixes; sounds are <Sfx name at volume> cues next to the Studio2D (at = frames into the beat).
- Truth: only the brief's facts and numbers on screen; "What if" fiction only when the brief asks for a story.

# Style bible: the aiTrends 2D look

Follow this closely. It is the only description of the target look; no reference images are available.

## The look in one paragraph
Pure black (\`S().ink\`) stick figures, each with a circle head and thick round-capped line limbs, carry a thin rim-light edge on the side facing the light. They act inside **low-key, cinematic, flat-shaded vector environments**: one strong light source per scene (a sunset window, a street lamp, stadium floodlights, a monitor), deep purple or navy shadows, warm amber highlights, soft glows, floating dust or rain, shallow depth of field (blurred foreground and background layers), a slow constant camera drift, letterboxed frames, film grain and a vignette. Characters are recognised by ONE coloured garment or accessory. Faces are minimal: white dot or ring eyes, a simple white mouth shape, and occasional brows. The rhythm is broken up with giant face close-ups that fill the frame, freeze-frame moments with particles hanging in the air, glowing animated numbers and charts, navy blueprint diagrams for explanations, and low-poly 3D shots that use the same figures and palette. The overall feel is "a stick-figure film lit by a cinematographer": simple shapes, sophisticated light.

## Characters
- **Construction** (handled by \`drawFigure\`): head circle r = 26 rig units, torso 15, limbs 11–13 with round caps, short forward-pointing foot stubs, no fingers at normal sizes. Hands and fingers appear only in insert close-ups (thick capsules).
- **Depth shading:** the near arm and leg are pure ink. The far arm and leg use \`inkFar\`, a dark purple-grey. That's automatic.
- **Rim light on every lit character:** pass \`rim: { color: M.rim, dir: [dx, dy] }\`, where \`dir\` points from the figure toward the light. Backlit by a window or sun behind → \`[0, -1]\`. Light from the left → \`[-1, -0.3]\`. Width 4–5 at 1080p. The rim is what makes black-on-dark readable, so never skip it.
- **Signature items** (exactly one strong colour per recurring character; keep it identical all video): red-orange hoodie \`#d64a33\`, yellow cap \`#f2c21a\`, pink beanie \`#f29ac0\`, green cap \`#3fb950\`, blue tee \`#3a6ea5\`, purple tracksuit \`#8a5ad6\`, white lab coat + round glasses (scientist), black trench + fedora + sunglasses (mysterious mentor or antagonist, often half in shadow), headband in any accent colour (athlete), ponytail or bun to add variety. Children: \`kid: true\` (72% size). Background people and crowds: plain ink with no colour item.
- **Faces** are drawn on the side the figure faces (3/4 view). Expressions are the main acting tool. Change them **on the beat of the words**, not randomly:
  \`neutral, smile, happy, joy, surprised, shocked, scared, worried, nervous, angry, determined, sad, cry, smirk, sleepy, thinking, confused, awe\`.
  Blink every 2.5–4 s (\`blink: (t % 3.1) > 3.0\`, with a different period per character).
- **Talking:** only when a character speaks a quoted line. Use \`talk: talkAmount(info.globalT, lineStart, lineEnd)\` (driven by real word timings) and add 2–3 faint expanding \`FX.rings\` around the head. The narrator is never lip-synced.
- **Acting:** poses must read as silhouettes. Use \`POSES\` with \`posesAt(t, [[0,'stand'],[0.6,'point']])\`, blending ~0.3 s, and wrap standing or sitting figures in \`breathe(pose, t, 1, seed)\` so nobody is frozen. The exception is freeze-time moments, where the world is frozen and only the hero moves. Walking and running use \`walkPose(phase, {run})\`, moving x at a matching speed (walk ≈ 160 units/s × s, run ≈ 420 units/s × s, with phase = t × 2π × 0.9 for walk and × 1.6 for run). Use \`trail: {count:4, dx:-40}\` for super-speed afterimages.
- **Scale:** wide shots \`s\` ≈ 0.8–1.2 (figures fill 15–25% of the frame height). Medium shots \`s\` ≈ 1.5–1.8. Emotional close-ups use \`bigFace\` (radius 280–360 at 1080p, head slightly below centre, shoulders cropped by the frame bottom, with a rim crescent on the lit side). Always put figures on a floor with a contact shadow (automatic) and never let them float.

## Sets and environments
- Built from **flat shapes and soft linear gradients**: no outlines, no photos, no clip-art, no emoji. Texture is limited to floor lines, window mullions, blinds and lit-window grids.
- **Value structure:** 60–75% of the frame is dark mid-tones (walls and floors from the mood, usually darkened with \`shade(c, -0.3)\`), with 1–3 bright accents (a window, lamps, screens, floodlights, a sunset). **Stage black figures in front of the brightest area** (a window, a light pool, a glowing screen) so their silhouettes read.
- **Depth layers** with parallax via \`layer(g, cam, depth, fn)\`: sky 0.1–0.2 → skyline/hills 0.3–0.4 → back wall/facade 0.5–0.6 → floor/props 0.8–0.9 → characters 1.0 → blurred foreground 1.5–1.8 (\`blurLayer(g, 8–14, fn, cam, 1.7)\`). Most medium shots should have something soft in the foreground (glassware, plants, a railing, crowd heads, another character's shoulder).
- **Windows are the signature element.** Large windows with mullions and a sky gradient behind (sunset, golden, or night with a skyline of lit windows), a sun or moon glow, sometimes blinds. Night streets have house facades with warm lit windows, steps, lamp posts with light cones, parked cars and trees as round silhouettes.
- Typical locations to invent from the script: labs, cafés, bedrooms (moonlight on the bed), kitchens, classrooms, offices, hospitals, locker rooms, stadiums (tiered crowd rows, floodlight rigs, giant screen), streets, rooftops, piers at sunset, roads at night, parks, airports, space. Build each as a reusable \`sets/<name>.js\` function anchored to \`GY\` (the ground line: \`E.H * V(0.8, 0.68)\`) and \`CX = E.W/2\`. Extend walls, floors and skies far beyond the frame so camera moves never reveal edges.
- **Atmosphere in nearly every shot:** dust motes indoors (\`FX.dust\`), rain streaks for storms and night (\`FX.rain\`), frozen droplets or bubbles for time-stop (\`FX.drops\`), stars in night skies, a lens streak across bright sources (\`FX.lensStreak\`), god rays from suns and windows (\`FX.godRays\`), and soft fog bands.

## Light and colour
- Pick a **mood** per location: \`M = mood('night')\` gives \`sky[], ambient, key, rim, wall, floor, dark, practical, grass, road, fog\`. Take every colour from \`M\`, \`S()\` (style tokens) or the cast. Avoid hard-coded colours so style switching works.
- The story drives the mood: tense or scary beats go darker and cooler (night/storm/interiorCool), triumphant or tender beats go warm (golden/dusk/interiorWarm), and explanations use \`void\`/blueprint.
- **One key light per shot.** Show it (a sun, lamp or window) and spill it: \`glow()\` around the source, \`FX.pool()\` on the floor under it, \`FX.lightCone()\` from lamps, \`FX.godRays()\` from windows and suns.
- The global colour grade comes from the chosen style and is applied automatically to every final frame, 2D and 3D alike: per-channel lift/gamma/gain (lift tints shadows, gain tints highlights), contrast, saturation, vignette and grain. Bloom applies to 3D. This is why scenes must use mood and style colours: the grade then makes each style look distinct.

## Camera (never fully static)
Every shot moves: a slow push-in (\`z\` 1.0 → 1.05–1.10 over the shot), a lateral drift (\`x\` ±20–60), a slow pull-out for reveals, a slight roll (\`r\` ±0.02) for unease, or shake (\`shake(t, amp)\`) for impacts. Use \`ease.inOut\` for moves and \`ease.out\` for snaps.

**Shot vocabulary** (use all of these across a video, roughly in these proportions):
1. **Establishing wide** (10%): the location with small figures and a slow push. Opens each new scene. Often 3D.
2. **Medium two-shot** (25%): side view, characters facing each other, conversation and action.
3. **Over-the-shoulder** (10%): a big blurred silhouette of one character in the foreground (\`blurLayer\`, depth 1.6), the other sharp.
4. **Giant face close-up** (\`bigFace\`, 10–15%): reactions, realisations, "you" moments, dialogue lines. Background = the location, blurred and darkened (\`blurLayer\` + \`veil\`).
5. **Insert / macro** (10%): hands, a phone screen, a watch, a ball, a cup, a door handle. Big, simple, blurred background.
6. **Top-down / diagram view** (5%): e.g. a table from above with a dotted trajectory and a timing label.
7. **Freeze frame / time-stop** (signature moment, 1–3 per video): particles hanging in the air, a cool tint, a corner badge (\`100x\`), slow rings, a slow rotation, only the hero moving. Enter with a \`flash\` transition and a \`freeze\` SFX.
8. **3D orbit / fly-through** (about 1 per minute): big spaces like stadiums, streets and halls, using \`three-kit\` (engine-api.md, three-kit).
9. **Data card / UI** (as needed): any number the narrator says appears on screen and animates as it's spoken.
10. **Blueprint diagram**: the explanatory or science segment (navy grid, light-blue line art, gold highlights, labels synced to words).
11. **Title card**: glowing caps title over a cinematic wide (often after the cold-open hook).
12. **End screen**: the question in serif italic, a comment bubble, a subscribe pill, and the whole cast lined up.

**Letterbox (\`bars\`):** \`wide\` (2:1) is the default. \`scope\` (2.39:1) is for drama: the title, freezes, climaxes and intense close-ups. Use \`none\` for full-frame UI or blueprint if wanted. Bars animate smoothly between shots.

## Editing and transitions
Hard **cut** by default (80% or more). **flash** (white) into freeze, time-stop or superpower moments and big realisations. **dip** (to black) for time skips and chapter changes. **fade** for gentle or dreamy moments and the title card. **whip** for energetic jumps between places. **zoom** to dive into an explanation. Keep continuity: the same outfits, the same screen direction (in a conversation, the hero is on the left facing right), and the same set geometry for every shot in a scene.

## On-screen graphics and typography
- **Fonts:** Fredoka Bold for titles and big lines (ALL CAPS, letter-spaced, warm glow). Nunito Black for labels and numbers. Playfair Display Black Italic for the end-screen question.
- **Colours:** gold \`S().ui.gold\` for key numbers, coral \`ui.accent\` for alarming values, cream \`ui.cream\` for labels, blueprint blue \`ui.blueprint\`.
- **Toolkit (\`ui2d\`):** \`titleCard\`, \`bigLine\` (a question or chapter line), \`badge\` (corner multiplier or day counter), \`readout\` ("NORMAL: 0.25 s"), \`dataCard\` (title, counter and a curve drawing on), \`compareBars\`, \`dimension\` (arrowed measure "30 m"), \`callout\` (leader-line label), \`meter\`, \`blueprint\` + \`lineFigure\`, \`bubble\`, \`endScreen\`, \`captions\`.
- Every number or measurement the narrator says should appear, synced with \`wordTime()\`. Keep text minimal: at most 1–2 short labels at once, and never sentences except the title, the question and the end screen.
- Pop graphics in with \`ease.outBack\` scale and a \`pop\`/\`blip\` SFX. Fade them out before the cut.

## Story conventions ("What if…?" narratives; use only what the script contains)
Cold-open hook (a dramatic moment, often a freeze) → title card → normal life and the discovery → escalation with concrete numbers → the cost or twist → the climax → the resolution → "Is any of this real?" (blueprint science segment) → end screen with a question and CTA. Explainer, history and documentary scripts use the same vocabulary: characters act out examples, data cards carry numbers, blueprint diagrams explain mechanisms.

## Don't
No realism, gradients on characters, thick outlines, photos, emoji, clip-art or flat white backgrounds (except flashes). No static shots. No figures without rim light in lit scenes. No narrator lip-sync. No walls of text. No more than ~4 characters in focus at once (crowds are fine). No floating figures. No outfit colour changes. No centring everything (use thirds; the face close-up is the exception). No hard-coded colours that ignore \`mood()\`/\`S()\`. No \`Math.random()\` or \`Date.now()\` in scenes (they break determinism; use \`rng(seed)\` and \`t\`).


## 9:16 vertical rules
The logical stage is 1080×1920 (\`E.vertical === true\`). Use \`V(landscape, vertical)\` for every size and position that depends on the aspect.
- **Closer framing:** medium shots and close-ups dominate. Wides become tall stacks (sky → building → ground), with figures in the middle third.
- **Safe area:** keep faces and text inside the central ~900×1500, away from platform UI. Captions sit at ~79% of the height (\`captions: true\` in config.json); auto-shrink long phrases.
- Diagrams stack vertically (eye above brain above arm). Data cards are taller. Font sizes are larger (the UI helpers already use \`V()\`).
- Bars default to \`none\`, and \`scope\` gives thin bars. Ground line \`GY = E.H * 0.68\`, which keeps characters above the captions (y ≈ 0.79·H). Set \`"captions": false\` on title-card or end-screen shots so the words don't duplicate on-screen text.
- Check with \`--sheet\` in 9:16 before rendering. Shots designed only for 16:9 usually crop the subject.

---

# Engine reference (adapted)
## Shot modules
\`\`\`js
import { E, V, registerShot, mood, layer, blurLayer, veil, ease, prog, key, wordTime, talkAmount } from '/engine/core.js';
import { drawFigure, POSES, posesAt, breathe, walkPose, bigFace, headPos } from '/engine/rig2d.js';
import * as FX from '/engine/fx2d.js';  import * as UI from '/engine/ui2d.js';
import { lab } from '../sets/lab.js';  import { MAX, DOC } from '../cast.js';

registerShot('s013', { draw(g, t, info) {            // 2D: g = canvas ctx in logical units, t = seconds into the shot
  const cam = { z: 1 + 0.06 * ease.inOut(t / info.dur), x: -30 };
  const { GY, M } = lab(g, t, cam);
  layer(g, cam, 1, g => drawFigure(g, { x: E.W/2 - 40, y: GY, s: 1.4, facing: -1, outfit: DOC,
        pose: breathe(posesAt(t, [[0, 'stand'], [0.4, 'point']]), t), expr: 'smile', rim: { color: M.rim, dir: [0, -1] } }));
  FX.dust(g, t);
}});
registerShot('s008', { kind: '3d',                   // 3D: init once (T = three-kit), draw per frame, optional 2D overlay
  init(T, info) { const st = T.stage({ mood: 'golden' }); /* build */ return { stage: st }; },
  draw(s, t, info, T) { T.orbit(s.stage.camera, t, { target: [0, 1, 0], radius: 6, height: 2.5, from: -0.8, to: 0.3, dur: info.dur }); },
  overlay(g, t, info, s) { /* 2D graphics on top, logical units */ } });
\`\`\`
\`info = { dur, globalT, p, line, shot, ...shot.params }\`. An exception inside a shot is printed to the console and drawn as red text on the frame, so check the render output.

## Core, rig, FX and UI API (logical units: 16:9 → 1920×1080, 9:16 → 1080×1920)
- **core.js:** \`E\` (W, H, PX, fps, vertical, cfg, words, shots), \`V(h, v)\`, \`clamp lerp prog ease{linear,in,out,inOut,sine,outBack,outElastic} key(t, [[t,v],…], ease) mixVal rng(seed) noise(x, seed) shake(t, amp, freq, seed) talkAmount(globalT, from, to) wordTime(word, afterGlobalT)\`, colour \`rgb css mix alpha shade\`, \`mood(name) S() setStyle\`, draw \`rr seg poly circle ring linGrad radGrad glow fillRect backdrop veil text measure FONTS\`, camera \`layer(g, cam, depth, fn) blurLayer(g, amount, fn, cam?, depth?)\`, \`registerShot getShot\`.
- **rig2d.js:** \`drawFigure(g, {x, y, s, facing, pose, rot, outfit, expr, talk, blink, look:[x,y], rim:{color, dir, w}, dim, alpha, prop, shadow, trail})\`. Poses: \`POSES.{stand, relaxed, talk, explain, point, pointUp, wave, cheer, handsOnHead, crossArms, think, shrug, holdFront, phone, reach, sad, facepalm, ready, crouch, sit, sitBack, kneel, lie(+rot), dive(+rot), kick, jump, fall}\`, plus \`posesAt, blendPose, breathe, walkPose(phase, {run})\`, \`face(g, x, y, r, {expr, talk, blink, look, front})\`, \`bigFace(g, cx, cy, r, {outfit, expr, talk, blink, look, rimColor, rimSide, tilt})\`, \`headPos(o) → [x, y, r]\`, \`soccerBall(g, x, y, r, rot)\`. Props: \`phone, ball, paper, cup, paddle, pointer, tablet, flashlight\`. Outfit: \`top: hoodie|labcoat|trench|jersey|tshirt|suit|dress|tracksuit|none, color, color2, legs, head: cap|capBack|beanie|fedora|headband|visor|hood|ponytail|bun|curly|spiky|none, headColor, face: glasses|sunglasses, gloves, number, kid\`. Custom poses are plain objects with the 11 points; edit a copy (\`{...POSES.sit, hF:[34,-188]}\`).
- **fx2d.js:** \`rain drops dust snow stars fog sun moon godRays lightCone pool lensStreak sparkle lightning speedLines rings skyline hills clouds tree pine lampPost windowFrame facade door chair stool counter screen bed clock floorLines crowd\`.
- **ui2d.js:** \`titleCard bigLine badge readout callout dimension dataCard compareBars meter blueprint bpStroke lineFigure bubble endScreen captions\`.

## three-kit.js (passed as \`T\` to \`init\`/\`draw\`)
\`T.stage({mood, fov, fog:[near, far], sky, keyPos, keyIntensity, ambient, bloom})\` → \`{scene, camera, composer, sun, add(...objs), render(), dispose()}\`. Builders: \`box cyl cone sphere plane ground(w, d, color, tex) planks tiles windowPane(w, h, {glowColor, cols, rows, power, interior}) shaft(w, len, color, opacity) building(w, h, d, {color, win, lit}) tree3D pine3D crowd3D({rows, perRow, width, step, rise, colors}) figure3D(outfit, {rim, pose, s}) → .setPose(pose)\`, \`mat basic canvasTex\`, and cameras \`orbit(camera, t, {target, radius, height, from, to, dur})\` and \`dolly(camera, t, [[t, {pos, look, fov}], …])\`. Units are metres, a figure is ~1.7 m and faces +x. 3D shots get the same grade, bars and grain automatically. Keep exposure moody: let windows and lamps be the brightest things, and keep the floor dark.

# Story breakdown (the creative pass)

Read the whole transcript twice. Then write \`story/bible.md\` (short, practical):
- **Logline and tone** (wonder / suspense / comedy / drama), plus who "you" is if the script is in second person.
- **Cast table.** For each recurring character: id, role, outfit \`{top, color, head, headColor, face, legs, gloves, kid}\`, signature colour, personality, and the expressions they use most. Every recurring character gets exactly ONE distinct saturated signature item (style-bible.md, Characters). Put the outfits in \`scenes/cast.js\`.
- **Locations (sets).** For each: name, mood (\`day|golden|dusk|night|storm|interiorWarm|interiorCool|void\`), where the key light comes from, the window/view, 3–6 signature props, and the layers (sky → far → mid → floor → foreground).
- **Motifs:** recurring visual devices tied to the story, such as a frozen-droplets look for slowed time, a corner multiplier badge, a heartbeat line, or a colour that marks a power.
- **Act / music plan:** sections with a mood and intensity (sound-design.md).

Then write each beat's shots (the beat file's \`shots\` array): for every shot its \`id\`, \`dur\`, \`line\` (the words spoken over it), a comment with one concrete sentence describing the picture (e.g. "OTS: blurred Jake shoulder fg, Max at the window, rain, slow push"), its set, \`bars\`, \`in\` (transition) and its sounds (<Sfx> beside the Studio2D).

Pacing rules:
- Shots are **contiguous**: each \`end\` equals the next \`start\`. The first starts at 0 and the last ends at \`duration\`, which is the voiceover length plus about 1.5 s.
- Cut on phrase boundaries. Start a shot **0.1–0.2 s before** the phrase it illustrates.
- Target a **median of 2–3.5 s**. Fast action: 0.8–2 s cuts (split one phrase into several shots). Emotional or dialogue holds: 4–8 s. Never go beyond ~10 s without a new action or camera move.
- Every new location opens with an establishing shot (wide 2D or 3D).
- Expect roughly **15–25 shots per minute** of narration.

## QC checklist (run on every contact sheet)
- [ ] No \`MISSING SHOT\` or red \`ERROR\` frames, and the console printed no shot errors.
- [ ] Each picture matches its \`line\`, and the key action lands on the key word.
- [ ] Characters are readable: rim light present, staged against brighter areas, not cut off at the edges, not overlapping text.
- [ ] Outfits and screen direction are consistent within a scene, and every character has a contact shadow or is grounded.
- [ ] Moody value structure (mostly dark, 1–3 bright accents), not flat or washed out, and colours come from the mood/style.
- [ ] Every shot has camera motion and some atmosphere (dust/rain/particles/glows).
- [ ] Text is short, inside the safe area, and legible at phone size. Numbers match the narration.
- [ ] Variety: no more than 3 consecutive shots of the same type or framing, with close-ups and inserts sprinkled in.
- [ ] 9:16: subjects in the middle, nothing important under the captions.`;
