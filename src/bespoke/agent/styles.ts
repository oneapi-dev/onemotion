/**
 * The menus a film's look and structure are chosen from. Adapted from
 * bang-motion (MIT, (c) 2026 Bang Tutorial, github.com/bangtutorial/bang-motion),
 * rewritten for OneMotion's renderer: no CSS 3D, blend modes or backdrop
 * filters, so depth comes from the kit's 2.5D camera, layering and canvas.
 */

/** Style directions: the skin, derived from the brand. */
export const DIRECTIONS = [
  { name: "Cinematic dark", background: "near-black, one soft light falling on the objects, slow dust; no colour gradients or glows", type: "bold clean grotesk", motion: "push-through, light in front of the lens", for: "creative tools, gaming, tech" },
  { name: "Poster color-block", background: "large solid colour fields that change per beat, fine grain", type: "ultra-heavy display, giant words cropped by the frame edge", motion: "block wipes, type slamming the frame edge", for: "consumer apps, music, events" },
  { name: "Editorial light", background: "white or cream, generous space, hairlines", type: "display serif with a small grotesk", motion: "calm slides, lines that draw themselves", for: "productivity, finance, SaaS" },
  { name: "Paper and print", background: "paper texture, collage, stamps, tape", type: "handwriting with a serif", motion: "objects flying in and landing at an angle", for: "education, community, food" },
  { name: "Retro analog", background: "faded colour, grain, scanlines", type: "70s to 90s geometric", motion: "controlled glitch, rough zoom, freeze frame", for: "nostalgia, music, entertainment" },
  { name: "Brutalist mono", background: "black and white, hard grid, ruled boxes", type: "monospace with a condensed face", motion: "hard cuts, shifting blocks, a blinking cursor", for: "developer tools, technical products" },
  { name: "Pastel playful", background: "stacked pastels, big round shapes", type: "heavy rounded sans", motion: "elastic bounce, shapes that bloom", for: "kids, health, lifestyle" },
  { name: "Luxury dark", background: "black with gold or bronze, soft shadows, sheen", type: "tall wide-tracked serif", motion: "slow motion, sweeping light, depth", for: "fashion, automotive, property" },
  { name: "Flat pop with photos", background: "light neutral alternating with solid brand colour fields", type: "rounded heavy sans and giant cropped words", motion: "cutouts popping in, stickers, colour fields snapping on the beat", for: "consumer apps, fintech, e-commerce" },
  { name: "Kinetic type", background: "three solid grounds (a dark, the brand accent, a paper) flipping on phrase changes, fine grain", type: "one heavy or condensed display (Archivo, Anton, Bebas Neue, Archivo Black) filling the frame width, in caps", motion: "a word on every music beat, whip pans, a zoom through a letter's counter, a TV switch-off (the kit's KineticType)", for: "launch teasers, game trailers, hype cuts, events, a strong one-line claim" },
] as const;

/** Explainer styles: for films that explain rather than sell. */
export const EXPLAINER_STYLES = [
  { name: "Continuous action", look: "a flowing vector world, one subject that never leaves, changing viewpoints, numbers living inside the world", for: "speed, routes, processes" },
  { name: "Cartoon collage", look: "cream paper, flat illustration cutouts, handwriting, colour pills", for: "science, education" },
  { name: "Visual journalism", look: "black ground, real images with source tags, highlighter, dashed annotations", for: "news, current issues" },
  { name: "White catalog", look: "white grid, product cutouts, mixed script and heavy sans, scribbles", for: "products, brands" },
  { name: "Vintage sketch", look: "sepia paper, engraving-like art, classic serifs, rust annotations", for: "history, biography" },
  { name: "Cartoon stage", look: "one living stage per scene with at least ten things moving, jointed characters, no captions", for: "education with characters" },
] as const;

/** Opener and promo concepts: the structure, chosen per product. */
export const CONCEPTS = [
  { name: "One continuous shot", for: "creative tools, hardware, spaces" },
  { name: "Pure typography", for: "strong taglines, events, releases" },
  { name: "Problem, then gone", for: "productivity, utilities" },
  { name: "Before and after", for: "editors, filters, optimisation" },
  { name: "Journey inside the UI", for: "apps with a distinctive interface" },
  { name: "Product macro", for: "hardware, packaging, food, fashion" },
  { name: "Object metaphor", for: "security, cloud, finance, infrastructure" },
  { name: "Living number", for: "milestones, performance" },
  { name: "One feature, fully demoed", for: "apps with one clear edge" },
  { name: "Question on screen, then the answer", for: "AI, search, support" },
  { name: "Rhythmic collage", for: "music, lifestyle, community" },
  { name: "Logo as stage", for: "brands with a strong logo shape" },
  { name: "Object relay", for: "e-commerce, delivery, marketplaces" },
  { name: "Brand system showcase", for: "launches, rebrands, communities" },
  { name: "Claim, how, result", for: "new features, generative AI, creative tools" },
  { name: "Living UI ecosystem", for: "B2B SaaS, AI assistants, workflows" },
  { name: "Flat pop with photos", for: "consumer apps, fintech, campaigns" },
  { name: "Product tour with claims", for: "SaaS, team tools, dashboards" },
  { name: "Kinetic launch on the beat", for: "teasers, trailers and launches the brief wants loud: the script cut into one or two words a music beat, the drop on the turn, the name last" },
] as const;

/** How the background keeps moving: never still, and not by default things streaking sideways. */
export const BACKGROUND_MOTIONS = [
  "a textured background with a breathing camera and one slow shift of tint, light or grain",
  "living paper grain or texture (its offset stepping with the frame)",
  "one light sweep per segment, never continuous",
  "big geometric shapes from the logo or theme turning once every 20 to 40 s, two parallax layers",
  "particles rising slowly (dust, bubbles, sparks), never sideways",
  "a grid or pattern breathing (scale or opacity 1.0 to 1.04 over 6 to 10 s)",
  "giant ghost type sliding slowly behind, low contrast",
  "a theme picture with a slow push and two-layer parallax",
  "horizontal streaks or lanes, ONLY when the theme is speed or flow",
  "palette colour fields snapping in on the beat, each filled with moving shapes",
] as const;

/** The background's surface: always at least two layers, never one flat colour (except poster color-block and flat pop). */
export const SURFACES = ["paper or grain texture over a flat base", "a fine grid or dot pattern over a flat base", "a spotlight with a tint", "a layered sky with thin colour bands", "a printed halftone or hatching texture", "a soft vignette over a flat base"] as const;

/** One family of object rendering per film. */
export const RENDER_FAMILIES = ["flat solid", "flat with palette dots", "soft 3D or clay (matte, rounded, soft shadow)", "glossy 3D (shine, rim light)", "isometric", "flat character illustration", "realistic photo or render layers"] as const;

/** How a sentence gets its emphasis: one per film, "none" is a real choice. */
export const EMPHASIS = ["none (word by word from dim to full, size, a pause, or an object beside the word)", "pill (a colour block growing from the left)", "underline drawing on", "marker swipe", "box drawing around", "colour only", "strike, then the replacement word"] as const;

const list = (rows: readonly string[]) => rows.map((r) => `- ${r}`).join("\n");

/** The menus as the creative director reads them. */
export const STYLE_MENUS = `# STYLE DIRECTIONS (the skin; pick one, or blend two on purpose)
${DIRECTIONS.map((d) => `- ${d.name}: background ${d.background}; type ${d.type}; signature motion ${d.motion}; good for ${d.for}`).join("\n")}

# EXPLAINER STYLES (when the film explains rather than sells)
${EXPLAINER_STYLES.map((d) => `- ${d.name}: ${d.look}; good for ${d.for}`).join("\n")}

# CONCEPTS (the structure; name three candidates, pick the one the product earns)
${CONCEPTS.map((c) => `- ${c.name}: ${c.for}`).join("\n")}

# BACKGROUND MOTION (the background never sits still)
${list(BACKGROUND_MOTIONS)}

# BACKGROUND SURFACE (at least two layers)
${list(SURFACES)}

# RENDER FAMILY (one per film)
${list(RENDER_FAMILIES)}

# EMPHASIS (one per film)
${list(EMPHASIS)}`;
