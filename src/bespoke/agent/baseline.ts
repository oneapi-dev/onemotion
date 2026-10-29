/**
 * The baseline film: a complete, decent scene written by code from the
 * concept, before any model writes a line. Its theme comes from the
 * concept's palette and type; its stage is one world (the kit's <World>):
 * every beat is a station the camera travels to, so nothing fades out like
 * a slide; every beat is a finished moment from the kit (a price that
 * counts and lands, a command that runs, a headline that rises from a mask,
 * the logo lockup), laid out differently from the beat before, with its
 * sounds. A kinetic film's headlines are KineticType runs on the music's
 * beat instead, its stations hard cuts. The designer starts from a film that already works and makes it
 * its own; a beat it makes worse goes back to this one. That is the
 * studio's floor, whatever the model. Pure: concept in, files out.
 */

import type { WorldLayout, WorldMove } from "../kit/world";
import type { Concept } from "./concept";
import { codeSize } from "./floor";
import { BEATS_INDEX, beatFile, beatsIndex } from "./parallel";
import { isKinetic } from "./story";

type BaseBeat = { id: string; says: string; shows: string };
/** The film's brand, and in a collaboration the partner's name. */
type Brand = { name: string; url: string; partner?: string };

const q = (s: string) => JSON.stringify(s);

/** The beat's moment, from its words: a price that changes, a command or API call, the close, or a headline. */
export function kindOf(b: BaseBeat, last: boolean): "close" | "price" | "code" | "headline" {
  if (last) return "close";
  const figures = (b.says.match(/\$\s?\d+(?:[.,]\d+)?/g) ?? []).length;
  if (figures >= 1 && /→|->|\bget\b|\bjadi\b|becomes|\bto\b/i.test(b.says)) return "price";
  if (/\b(api|curl|sdk|terminal|endpoint|request|code|console|cli|chat\/completions)\b/i.test(`${b.says} ${b.shows}`)) return "code";
  return "headline";
}

/** A headline split into at most two balanced lines. */
export function lines(text: string): string {
  const words = text.trim().split(/\s+/);
  if (words.length < 3 || text.length < 18) return text.trim();
  let best = 1;
  let gap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const d = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length);
    if (d < gap) {
      gap = d;
      best = i;
    }
  }
  return `${words.slice(0, best).join(" ")}\n${words.slice(best).join(" ")}`;
}

const theme = (c: Concept) => `// The film's theme, from the concept: every beat takes its colours, faces and sizes from here.
export const BG = ${q(c.palette.bg)};
export const INK = ${q(c.palette.ink)};
export const ACCENT = ${q(c.palette.accent)};
export const SUPPORT = ${q(c.palette.support)};
export const DISPLAY = ${q(c.typography.display)};
export const TEXT = ${q(c.typography.text)};
export const MONO = ${q(c.typography.mono ?? "JetBrains Mono")};
`;

/** Deterministic 0..1 from a string. */
const hash = (s: string) => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
};

/**
 * The world's shape and the camera's move, from the concept's camera words
 * (English or Indonesian); a concept that names neither gets a shape from
 * its title, so films differ.
 */
export function worldOf(c: Pick<Concept, "camera" | "title">): { layout: WorldLayout; move: WorldMove } {
  const cam = (c.camera ?? "").toLowerCase();
  const named: WorldLayout | null = /zig ?zag/.test(cam)
    ? "zigzag"
    : /diagonal/.test(cam)
      ? "diagonal"
      : /\bgrid\b|\bkisi/.test(cam)
        ? "grid"
        : /vertical|vertikal|\bdown(ward)?\b|turun|ke bawah|scroll/.test(cam)
          ? "column"
          : /canvas|kanvas|scatter|acak|organi[ck]|\bmap\b|\bpeta\b/.test(cam)
            ? "scatter"
            : /horizontal|sideways|samping|left to right|kiri ke kanan|\bpans?\b/.test(cam)
              ? "row"
              : null;
  const layout = named ?? (["row", "zigzag", "diagonal", "scatter"] as const)[Math.floor(hash(c.title) * 4)];
  const move: WorldMove = /whip|snap|sentak|cepat|fast/.test(cam) ? "whip" : /glid|smooth|halus|pelan|lambat|slow|calm|tenang|drift/.test(cam) ? "glide" : "swoop";
  return { layout, move };
}

/** A kinetic film's stage: full-frame stations the camera hard-cuts between on the beat. */
const kineticStage = () => `import { Grain, World } from "@kit";
import { BEATS } from "./beats";
import { BG, DISPLAY, MONO, TEXT } from "./theme";

export const fonts = { [DISPLAY]: ["500", "700"], [TEXT]: ["400", "600"], [MONO]: ["400", "500"] };
export const background = BG;
export const captions = false;

/** Kinetic type on the music's beat: every station is full frame and the camera hard-cuts between them on the beat. */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden" }}>
      <World of={BEATS} move="cut" push={0} />
      <Grain opacity={0.05} />
    </div>
  );
}
`;

const stage = (c: Concept) => {
  if (isKinetic(c)) return kineticStage();
  const { layout, move } = worldOf(c);
  // A route reads as a track where the stations line up; across a diagonal gap it is a stray stroke.
  const route = layout === "row" || layout === "column" ? ` route={{ color: \`\${INK}2E\`, width: 3, dot: ACCENT }}` : "";
  return `import { useCurrentFrame } from "remotion";
import { Grain, World, WorldGrid, useFilm } from "@kit";
import { BEATS } from "./beats";
import { ACCENT, BG, DISPLAY, INK, MONO, SUPPORT, TEXT } from "./theme";

export const fonts = { [DISPLAY]: ["500", "700"], [TEXT]: ["400", "600"], [MONO]: ["400", "500"] };
export const background = BG;
export const captionStyle = { bg: "rgba(20,20,22,0.88)", fg: "#FFFFFF", hot: ACCENT, font: TEXT };

/**
 * One world for the whole film: every beat is a station in it and the camera travels from one to the
 * next, so nothing fades out like a slide. Behind it, a grid that moves slower than the world and a far
 * light that drifts.
 */
export default function Scene() {
  const t = useCurrentFrame();
  const { W } = useFilm();
  const far = Math.sin(t / 140) * 18;
  return (
    <div style={{ position: "absolute", inset: 0, background: BG, overflow: "hidden" }}>
      <div style={{ position: "absolute", width: W * 0.7, height: W * 0.7, left: W * 0.55, top: -W * 0.25, borderRadius: "50%", background: \`\${ACCENT}10\`, transform: \`translate(\${-far * 2}px, \${far}px)\` }} />
      <World of={BEATS} layout=${q(layout)} move=${q(move)}${route} under={<WorldGrid depth={0.45} size={56} color={\`\${SUPPORT}30\`} />} />
      <Grain opacity={0.05} />
    </div>
  );
}
`;
};

/** The common head of a beat file. */
const head = (kitNames: string[]) => `import { useCurrentFrame } from "remotion";
import { ${[...new Set(["Sfx", "prog", "useFilm", "fit", ...kitNames])].sort().join(", ")} } from "@kit";
import { ACCENT, DISPLAY, INK, MONO, SUPPORT, TEXT } from "../theme";
`;

/** The opening beat runs `lead` frames ahead, so its first frame (the thumbnail) already shows its words. */
const clock = (lead: number) => (lead ? `const t = useCurrentFrame() + ${lead}; // already under way on frame 0: the thumbnail shows the words` : "const t = useCurrentFrame();");
/** A sound at a frame of the beat's own time, moved with its clock. */
const sfx = (name: string, at: number, volume: number, lead: number) => `<Sfx name="${name}" at={${Math.max(0, at - lead)}} volume={${volume}} />`;

/** Three compositions, taken in turn, so two beats in a row never share a layout. */
const LAYOUTS = ["left", "center", "right"] as const;

function headlineBeat(b: BaseBeat, i: number, lead: number): string {
  const text = lines(b.says);
  const layout = LAYOUTS[i % 3];
  return `${head(["MaskRise", "Annotate"])}
// ${b.id}: ${b.says.replace(/\n/g, " ")}
export default function Beat() {
  ${clock(lead)}
  const { W, H, safe } = useFilm();
  const text = ${q(text)};
  const maxW = (safe.right - safe.left) * ${layout === "center" ? 0.86 : 0.7};
  const size = Math.min(...text.split("\\n").map((l) => fit(l, DISPLAY, 700, ${layout === "center" ? 170 : 150}, maxW)));
  const bar = prog(t, 10, 40);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", ${layout === "right" ? "right: W - safe.right" : "left: safe.left"}, top: 0, bottom: H * 0.1, width: ${layout === "center" ? "safe.right - safe.left" : "maxW"}, display: "flex", flexDirection: "column", justifyContent: "center", textAlign: ${q(layout === "center" ? "center" : layout)} }}>
        <MaskRise text={text} t={t} at={2} size={size} font={DISPLAY} weight={700} color={INK} align={${q(layout === "center" ? "center" : layout)}} />
        <div style={{ height: 10, width: (${layout === "center" ? "maxW * 0.3" : "maxW * 0.45"}) * bar, background: ACCENT, borderRadius: 5, margin: ${q(layout === "center" ? "28px auto 0" : layout === "right" ? "28px 0 0 auto" : "28px 0 0")} }} />
      </div>
      <div style={{ position: "absolute", ${layout === "left" ? "right: W * 0.08" : "left: W * 0.08"}, top: H * ${layout === "center" ? 0.66 : 0.5}, width: W * 0.26, height: W * 0.26, borderRadius: "50%", border: \`4px solid \${ACCENT}\`, opacity: 0.28 * prog(t, 6, 30), transform: \`scale(\${0.9 + 0.1 * prog(t, 6, 30)}) rotate(\${t * 0.2}deg)\` }} />
      ${sfx("pop", 14, 0.25, lead)}
    </div>
  );
}
`;
}

/** A line cut into kinetic shots: CAPS, one or two words a shot (two only while they stay short). */
export function shotWords(says: string): string[] {
  const words = says.replace(/\s+/g, " ").trim().toUpperCase().split(" ").filter(Boolean);
  const out: string[] = [];
  for (const w of words) {
    const last = out[out.length - 1];
    if (last && !last.includes(" ") && !/[.!?:]$/.test(last) && last.length + w.length < 12) out[out.length - 1] = `${last} ${w}`;
    else out.push(w);
  }
  return out;
}

const WHIPS = ["right", "up", "left", "down"] as const;

/** A kinetic beat: its words as a KineticType run, one shot a music beat (half a beat when the words outnumber the beats), the grounds turning. */
function kineticBeat(b: BaseBeat, i: number, lead: number): string {
  const words = shotWords(b.says);
  const shots = words.map((text, k) => {
    const last = k === words.length - 1;
    const style = k === 0 ? "slam" : last && k > 1 ? "punch" : "cut";
    const into = k === 0 ? "" : `, in: ${q(WHIPS[(k + i) % 4])}`;
    return `    { at: b(${k} * step), text: ${q(text)}, style: ${q(style)}, ground: grounds[${(k + i) % 3}]${into}${last ? `, fx: "hit"` : ""} },`;
  });
  return `import { useCurrentFrame } from "remotion";
import { KineticType, isLight, onBeat, useFilm, type KShot } from "@kit";
import { ACCENT, BG, DISPLAY, INK } from "../theme";

// ${b.id}: ${b.says.replace(/\n/g, " ")}
export default function Beat() {
  ${clock(lead)}
  const { pulse, beat } = useFilm();
  const { start, end } = beat(${q(b.id)});
  // One shot a music beat, half a beat when the words outnumber the beats, at most two beats a shot.
  const step = Math.min(2, Math.max(0.5, Math.floor(((end - start) / pulse / ${words.length}) * 2) / 2));
  const b = (k: number) => onBeat(0, k, pulse);
  const light = isLight(BG);
  const paper = light ? BG : INK;
  const ink = light ? INK : BG;
  const grounds = [BG, ACCENT, paper];
  const shots: KShot[] = [
${shots.join("\n")}
  ];
  return <KineticType t={t} shots={shots} font={DISPLAY} weight={700} paper={paper} ink={ink} ground={BG} />;
}
`;
}

/** The change a price beat counts: its first two figures (a beat that lists several prices counts the first), with the decimals the new price is written with ($0.19 never lands as $0). */
export function priceChange(says: string): { from: number; to: number; decimals: number } {
  const raw = says.match(/\d+(?:[.,]\d+)?/g) ?? [];
  const nums = raw.map((n) => Number(n.replace(",", ".")));
  const shown = raw[1] ?? raw[0] ?? "";
  return { from: nums[0] ?? 0, to: nums[1] ?? nums[0] ?? 0, decimals: shown.split(/[.,]/)[1]?.length ?? 0 };
}

function priceBeat(b: BaseBeat, lead: number): string {
  const { from, to, decimals } = priceChange(b.says);
  const local = (at: string) => (lead ? `${at} - ${lead}` : at);
  return `${head(["MaskRise", "PriceCount", "Annotate", "useBeat"])}
// ${b.id}: ${b.says.replace(/\n/g, " ")}
export default function Beat() {
  ${clock(lead)}
  const { W, H, safe } = useFilm();
  const { len } = useBeat();
  const text = ${q(lines(b.says))};
  const size = Math.min(...text.split("\\n").map((l) => fit(l, DISPLAY, 700, 84, (safe.right - safe.left) * 0.8)));
  // The count lands well before the beat's hold, so the new price is what the viewer reads, never a figure mid-roll.
  const dur = Math.min(40, Math.round(len * 0.35));
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: safe.left, top: H * 0.16, width: safe.right - safe.left, textAlign: "center" }}>
        <MaskRise text={text} t={t} at={0} size={size} font={DISPLAY} weight={700} color={INK} align="center" />
      </div>
      <div style={{ position: "absolute", left: 0, right: 0, top: H * 0.42, display: "flex", justifyContent: "center" }}>
        {/* The circle lands just after the count. */}
        <Annotate kind="circle" at={${local("12 + dur + 4")}} color={ACCENT}>
          <PriceCount t={t} at={12} dur={dur} from={${from}} to={${to}} decimals={${decimals}} prefix="$" size={Math.min(W, H) * 0.26} color={INK} font={DISPLAY} />
        </Annotate>
      </div>
      ${sfx("tick", 14, 0.3, lead)}
      <Sfx name="ding" at={${local("12 + dur")}} volume={0.3} />
    </div>
  );
}
`;
}

function codeBeat(b: BaseBeat, brand: Brand, lead: number): string {
  const host = brand.url || "api.example.com";
  return `${head(["MaskRise", "TerminalRun", "Window", "UiReveal"])}
// ${b.id}: ${b.says.replace(/\n/g, " ")}
export default function Beat() {
  ${clock(lead)}
  const { W, H, safe } = useFilm();
  const text = ${q(lines(b.says))};
  const size = Math.min(...text.split("\\n").map((l) => fit(l, DISPLAY, 700, 96, (safe.right - safe.left) * 0.42)));
  const w = Math.min(W * 0.52, 1000);
  return (
    <div style={{ position: "absolute", inset: 0 }}>
      <div style={{ position: "absolute", left: safe.left, top: 0, bottom: H * 0.1, width: (safe.right - safe.left) * 0.42, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <MaskRise text={text} t={t} at={0} size={size} font={DISPLAY} weight={700} color={INK} />
      </div>
      <div style={{ position: "absolute", right: W - safe.right, top: H * 0.22 }}>
        <UiReveal t={t} at={4} tilt={30} angle={-14}>
          <Window kind="terminal" w={w} h={w * 0.56} title={${q(host)}}>
            <div style={{ padding: 28 }}>
              <TerminalRun t={t} at={14} command={${q(`curl https://${host}`)}} output={["status: ok", "streaming..."]} font={MONO} size={Math.round(w / 28)} accent={ACCENT} />
            </div>
          </Window>
        </UiReveal>
      </div>
      ${sfx("type", 14, 0.25, lead)}
      ${sfx("tick", 40, 0.25, lead)}
    </div>
  );
}
`;
}

/** The close's line without the address (the lockup's pill carries it), at most 12 words. */
export function closeLine(says: string, url: string): string {
  const host = url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const words = says.split(/\s+/).filter((w) => w && (!host || w.replace(/^https?:\/\//, "").replace(/[/.,!]+$/, "").toLowerCase() !== host.toLowerCase()));
  return words.slice(0, 12).join(" ");
}

function closeBeat(b: BaseBeat, brand: Brand, lead: number): string {
  const url = brand.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  // A collaboration closes on both marks and both names.
  if (brand.partner) {
    return `${head(["MaskRise", "CoMark", "Fit"])}
// ${b.id}: the close, both brands. ${b.says.replace(/\n/g, " ")}
export default function Beat() {
  ${clock(lead)}
  const { W, H, safe } = useFilm();
  const text = ${q(lines(closeLine(b.says, url)))};
  const size = Math.min(...text.split("\\n").map((l) => fit(l, DISPLAY, 700, 120, (safe.right - safe.left) * 0.86)));
  const mark = Math.min(W, H) * 0.11;
  const p = prog(t, 30, 48);
  const q2 = prog(t, 60, 84);
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: H * 0.05, paddingBottom: H * 0.06 }}>
      <MaskRise text={text} t={t} at={2} size={size} font={DISPLAY} weight={700} color={INK} align="center" />
      <CoMark size={mark} color={INK} style={{ opacity: p, transform: \`scale(\${0.9 + 0.1 * p})\` }} />
      <div style={{ opacity: q2, transform: \`translateY(\${(1 - q2) * 16}px)\` }}>
        <Fit text={${q(`${brand.name} × ${brand.partner}`)}} font={DISPLAY} weight={700} size={mark * 0.42} maxW={(safe.right - safe.left) * 0.8} style={{ color: INK }} />
      </div>
${url ? `      <div style={{ fontFamily: MONO, fontSize: mark * 0.24, color: ACCENT, opacity: prog(t, 78, 100) }}>{${q(url)}}</div>` : ""}
      ${sfx("impact", 32, 0.4, lead)}
      ${sfx("ding", 100, 0.3, lead)}
    </div>
  );
}
`;
  }
  return `${head(["LogoLockup", "MaskRise"])}
// ${b.id}: the close. ${b.says.replace(/\n/g, " ")}
export default function Beat() {
  ${clock(lead)}
  const { W, H, safe } = useFilm();
  const text = ${q(lines(closeLine(b.says, url)))};
  const size = Math.min(...text.split("\\n").map((l) => fit(l, DISPLAY, 700, 120, (safe.right - safe.left) * 0.86)));
  return (
    <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: H * 0.07, paddingBottom: H * 0.06 }}>
      <MaskRise text={text} t={t} at={2} size={size} font={DISPLAY} weight={700} color={INK} align="center" />
      <LogoLockup t={t} at={30} name={${q(brand.name || "")}} url={${q(url)}} size={Math.min(W, H) * 0.13} ink={INK} accent={ACCENT} font={DISPLAY} />
      ${sfx("impact", 32, 0.4, lead)}
      ${sfx("ding", 100, 0.3, lead)}
    </div>
  );
}
`;
}

/** Frames the opening beat runs ahead of the film, on top of the World's own `open`. */
const OPENING_LEAD = 0;

/** The whole baseline: theme, stage, beats index and one finished file per beat. */
export function baselineFiles(concept: Concept, beats: BaseBeat[], brand: Brand): Record<string, string> {
  if (isStudio2D(concept)) return studio2dFiles(concept, beats, brand);
  const files: Record<string, string> = { "scene/theme.ts": theme(concept), "scene/index.tsx": stage(concept), [BEATS_INDEX]: beatsIndex(beats.map((b) => b.id)) };
  let prev = "";
  const kinetic = isKinetic(concept);
  beats.forEach((b, i) => {
    // Two price or code moments in a row look like the same frame twice: the second is a headline.
    const found = kindOf(b, i === beats.length - 1);
    const kind = found === prev && found !== "close" ? "headline" : found;
    prev = kind;
    const lead = i === 0 ? OPENING_LEAD : 0;
    // A kinetic film cuts every beat but the close as type on the beat, prices and code included.
    files[beatFile(b.id)] = kind === "close" ? closeBeat(b, brand, lead) : kinetic ? kineticBeat(b, i, lead) : kind === "price" ? priceBeat(b, lead) : kind === "code" ? codeBeat(b, brand, lead) : headlineBeat(b, i, lead);
  });
  return files;
}

/** A file's code in ordinarily formatted lines (floor.ts): a beat written minified on a few long lines is not a sketch. */
const lineCount = codeSize;

/**
 * Beats the designer left worse than the baseline: a beat file cut to a
 * sketch (under 12 lines' worth of code and under half the baseline's), or a
 * stage that no longer renders the beats at all. Those go back to the baseline.
 */
export function gutted(files: Record<string, string>, base: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [path, was] of Object.entries(base)) {
    if (path === BEATS_INDEX || path === "scene/theme.ts") continue;
    const now = files[path];
    if (now === undefined) continue;
    if (path === "scene/index.tsx") {
      if (!/<(World|Beats)\b/.test(now) && Object.keys(base).some((p) => p.startsWith("scene/beats/b") && files[p] !== undefined && lineCount(files[p]) < 12)) out.push(path);
      continue;
    }
    const n = lineCount(now);
    if (n < 12 && n < lineCount(was) * 0.5) out.push(path);
  }
  return out;
}

/** A film in the Cinematic 2D story look (the aiTrends 2D studio): its concept names the look. */
export const isStudio2D = (c: { look?: { direction?: string; concept?: string } }) => /cinematic 2d/i.test(`${c.look?.direction ?? ""} ${c.look?.concept ?? ""}`);

/**
 * The Cinematic 2D story baseline: the 2D studio's own grammar from the first draft. A street at dusk, one
 * character (the viewer) in the film's accent, and each beat cut into a wide with the beat's words over
 * the acting figure and a giant face close-up; the close is a title card with the name and the address.
 */
function studio2dFiles(concept: Concept, beats: BaseBeat[], brand: Brand): Record<string, string> {
  const stage = `import { World } from "@kit";
import { BEATS } from "./beats";

export const fonts = { Fredoka: ["600", "700"], Nunito: ["800", "900"], "Playfair Display": ["900i"] };
export const background = "#000000";
export const captions = false;

/** The 2D studio film: one full-frame canvas a beat (its shots inside), hard cuts between beats. */
export default function Scene() {
  return (
    <div style={{ position: "absolute", inset: 0, background: "#000", overflow: "hidden" }}>
      <World of={BEATS} move="cut" push={0} open={0} />
    </div>
  );
}
`;
  const cast = `// STORY BIBLE (the studio's baseline; the designer rewrites it from the concept)
// Logline: ${concept.title.replace(/\n/g, " ")}. Tone: wonder.
// Cast: HERO, the viewer ("you"): a hoodie in the film's accent, the one signature colour.
// Locations: a street at dusk (key light: the setting sun behind; a street lamp and its pool of light).
// Motifs: the hero's colour marks what the film is about.
export const HERO = { top: "hoodie", color: ${q(concept.palette.accent)} };
`;
  const set = `import { s2, fx2 } from "@kit";

const { E, V, mood, layer, backdrop, fillRect } = s2;
const FX = fx2;

/** A street at dusk: sky, the sun behind, a lamp post and its pool of light, the floor. Returns the ground line and the mood. */
export function street(g: any, t: number, cam: any, name = "dusk") {
  const M = mood(name);
  const GY = E.H * V(0.8, 0.68);
  backdrop(g, M.sky);
  layer(g, cam, 0.15, (g: any) => FX.sun(g, E.W * 0.7, GY - V(220, 320), 80, "#fff6e0", M.key, 4));
  layer(g, cam, 0.9, (g: any) => {
    fillRect(g, -E.W, GY, E.W * 3, E.H, M.floor);
    FX.pool(g, E.W * 0.27, GY + 10, 220, 34, M.practical, 0.35);
    FX.lampPost(g, E.W * 0.27, GY, 360, {});
  });
  FX.godRays(g, E.W * 0.7, GY - V(220, 320), { color: M.key, a: 0.12 });
  FX.dust(g, t, { count: 40, color: "#ffe2bd", a: 0.35 });
  return { GY, M };
}
`;
  const head = `import { Studio2D, s2, rig, ui2 } from "@kit";
import { HERO } from "../cast";
import { street } from "../sets/street";

const { E, V, ease, layer, blurLayer, veil, mood } = s2;
const { drawFigure, posesAt, breathe, bigFace } = rig;
`;
  const files: Record<string, string> = { "scene/theme.ts": theme(concept), "scene/index.tsx": stage, [BEATS_INDEX]: beatsIndex(beats.map((b) => b.id)), "scene/cast.ts": cast, "scene/sets/street.ts": set };
  beats.forEach((b, i) => {
    const last = i === beats.length - 1;
    const fade = i === 0 ? " fadeIn={0.5}" : last ? " fadeOut={0.8}" : "";
    const says = b.says.replace(/\n/g, " ");
    const body = last
      ? `      {
        id: "${b.id}a",
        line: ${q(says)},
        bars: "scope",
        draw(g: any, t: number, info: any) {
          street(g, t, { z: 1 + 0.04 * ease.inOut(t / info.dur) });
          veil(g, "#000", 0.35);
          ui2.titleCard(g, t, { lines: [${q((brand.name || says).toUpperCase())}], sub: ${q(brand.url || says)}, dur: info.dur + 1 });
        },
      },`
      : `      {
        id: "${b.id}a",
        dur: 2.4,
        line: ${q(says)},
        bars: "wide",
        // Wide: the hero on the street at dusk, acting the line, its words over them; slow push and drift.
        draw(g: any, t: number, info: any) {
          const k = ease.inOut(t / info.dur);
          const cam = { z: 1 + 0.06 * k, x: -30 + 40 * k };
          const { GY, M } = street(g, t, cam);
          layer(g, cam, 1, (g: any) => drawFigure(g, { x: E.W * 0.46, y: GY, s: V(1.6, 1.8), facing: 1, outfit: HERO, pose: breathe(posesAt(t, [[0, "stand"], [0.8, "explain"]]), t), expr: "thinking", rim: { color: M.rim, dir: [0.7, -1] } }));
          ui2.bigLine(g, t, { str: ${q(says.toUpperCase())}, dur: info.dur + 1, y: E.H * V(0.22, 0.2) });
        },
      },
      {
        id: "${b.id}b",
        line: ${q(says)},
        in: { type: "cut" },
        bars: "scope",
        // Giant face close-up: the street blurred and darkened behind, the hero reacting.
        draw(g: any, t: number) {
          blurLayer(g, 10, (g: any) => street(g, t, { z: 1.08 }));
          veil(g, "#000", 0.3);
          bigFace(g, E.W / 2, E.H * V(0.62, 0.58), V(300, 340), { outfit: HERO, expr: "${["surprised", "awe", "determined", "smile"][i % 4]}", blink: t % 3.1 > 3.0, rimColor: mood("dusk").rim, rimSide: 1 });
        },
      },`;
    files[beatFile(b.id)] = `${head}
// ${b.id}: ${says}
export default function Beat() {
  return (
    <Studio2D
      style="dusk"${fade}
      shots={[
${body}
      ]}
    />
  );
}
`;
  });
  return files;
}
