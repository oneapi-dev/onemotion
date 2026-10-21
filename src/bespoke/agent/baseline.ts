/**
 * The baseline film: a complete, decent scene written by code from the
 * concept, before any model writes a line. Its theme comes from the
 * concept's palette and type; its stage is one world (the kit's <World>):
 * every beat is a station the camera travels to, so nothing fades out like
 * a slide; every beat is a finished moment from the kit (a price that
 * counts and lands, a command that runs, a headline that rises from a mask,
 * the logo lockup), laid out differently from the beat before, with its
 * sounds. The designer starts from a film that already works and makes it
 * its own; a beat it makes worse goes back to this one. That is the
 * studio's floor, whatever the model. Pure: concept in, files out.
 */

import type { WorldLayout, WorldMove } from "../kit/world";
import type { Concept } from "./concept";
import { codeSize } from "./floor";
import { BEATS_INDEX, beatFile, beatsIndex } from "./parallel";

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

const stage = (c: Concept) => {
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
  const files: Record<string, string> = { "scene/theme.ts": theme(concept), "scene/index.tsx": stage(concept), [BEATS_INDEX]: beatsIndex(beats.map((b) => b.id)) };
  let prev = "";
  beats.forEach((b, i) => {
    // Two price or code moments in a row look like the same frame twice: the second is a headline.
    const found = kindOf(b, i === beats.length - 1);
    const kind = found === prev && found !== "close" ? "headline" : found;
    prev = kind;
    const lead = i === 0 ? OPENING_LEAD : 0;
    files[beatFile(b.id)] = kind === "close" ? closeBeat(b, brand, lead) : kind === "price" ? priceBeat(b, lead) : kind === "code" ? codeBeat(b, brand, lead) : headlineBeat(b, i, lead);
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
