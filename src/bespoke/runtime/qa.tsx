import { useLayoutEffect, type RefObject } from "react";
import { useCurrentFrame } from "remotion";
import { FILM_FPS } from "../timing";

/**
 * Automated QA on the frames rendered for the model: text cut by the frame
 * edge, text clipped by its own box, text too small to read. The model sees
 * these warnings next to the pictures, which catch most but not all of it.
 */

/** Below this spread of brightness (0 to 255) a frame is one flat colour: nothing on it. */
export const FLAT_SPREAD = 3;

/** The standard deviation of brightness over RGBA pixels: how much is going on in a frame. */
export function flatness(rgba: Uint8ClampedArray): number {
  let n = 0;
  let sum = 0;
  let sq = 0;
  for (let i = 0; i + 2 < rgba.length; i += 4) {
    const y = 0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2];
    sum += y;
    sq += y * y;
    n++;
  }
  if (!n) return 0;
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sq / n - mean * mean));
}

/** The words visible on the stills being rendered now (what a viewer reads), collected with the warnings. */
export const qaSeen: string[] = [];

/** Below this share of the frame (0..1) differing from its background, a held frame is nearly empty. */
export const SPARSE_SHARE = 0.04;

/** The share of RGBA pixels that differ clearly from the frame's dominant colour: how much is on screen. */
export function coverage(rgba: Uint8ClampedArray): number {
  const lum: number[] = [];
  for (let i = 0; i + 2 < rgba.length; i += 4) lum.push(0.2126 * rgba[i] + 0.7152 * rgba[i + 1] + 0.0722 * rgba[i + 2]);
  if (!lum.length) return 0;
  // The dominant colour: the most common brightness, in steps of 8.
  const bins = new Map<number, number>();
  for (const y of lum) bins.set(Math.round(y / 8), (bins.get(Math.round(y / 8)) ?? 0) + 1);
  const base = [...bins].sort((a, b) => b[1] - a[1])[0][0] * 8;
  return lum.filter((y) => Math.abs(y - base) > 14).length / lum.length;
}

/** Warnings from the stills being rendered now; the film host empties it before a job and reads it after. */
export const qaWarnings: string[] = [];

/**
 * What one station shows on a still: every element's box relative to the station (so the camera's
 * slow push cancels out), its opacity, its words and style, and what its canvases have drawn.
 */
export type Print = { keys: string[]; nums: number[] };

/** The prints of the stills being rendered now, by frame and station ("*" for a film without a World); the film host empties it before a job. */
export const qaPrints = new Map<number, Map<string, Print>>();

/**
 * A frame's composition, as shares of the frame: its largest panel or object, and its largest line of type (with its rendered height in px).
 * `sheet`: the frame's words sit on one edged sheet (a border or a shadow) covering most of the frame, a slide inside the frame.
 */
export type Layout = { hero: { x: number; y: number; w: number; h: number } | null; type: { x: number; y: number; w: number; px: number } | null; sheet?: boolean };

/** An edged sheet this share of the frame's area or more, holding the frame's words, is a slide. */
const SHEET_SHARE = 0.55;

/** Beats that each put everything on one bordered sheet filling the frame: three or more, and at least half the film. */
export function slideSheets(holds: { beat: string; frame: number; layout: Layout }[]): string[] {
  const on = holds.filter((h) => h.layout.sheet);
  if (on.length < 3 || on.length < holds.length * 0.5) return [];
  return [`frame ${on[0].frame}: ${on.map((h) => h.beat).join(", ")} each sit on one bordered sheet that fills the frame: a slide per beat, the camera only moving from one to the next. Take the sheets away: the frame is the canvas; set the words straight on the background or on the subject itself, crop into the subject, and let one object carry from beat to beat`];
}

/** The layouts of the stills being rendered now, by frame; the film host empties it before a job. */
export const qaLayouts = new Map<number, Layout>();

/** Below these, nothing on a frame is big: the largest panel's share of the width, and the largest type's share of the height. */
const HERO_W = 0.42;
const HERO_TYPE = 0.12;

/** A frame where nothing is big (a headline over a small card in a sea of background, the slide look), or null. */
export function smallHero(l: Layout, frameH: number): string | null {
  const w = l.hero?.w ?? 0;
  const px = l.type?.px ?? 0;
  if (w >= HERO_W || px >= frameH * HERO_TYPE || (!l.hero && !l.type)) return null;
  return `nothing on this frame is big: its largest panel spans ${Math.round(w * 100)} % of the width and its largest type is ${Math.round(px)} px tall, a headline over a small card is a slide; give the hold one hero: the subject (the receipt, the screen, the meter, the object) at 55 to 75 % of the width, or type at least ${Math.round(frameH * 0.14)} px tall, and crop into it rather than floating it in empty space`;
}

/**
 * Beats that share one composition: three or more of them (and most of the film) put their largest type
 * and their largest panel in the same place at the same size. `holds` is one layout per beat.
 */
export function sameLayouts(holds: { beat: string; frame: number; layout: Layout }[]): string[] {
  const sig = (l: Layout) => [l.type ? l.type.x + l.type.w / 2 : -1, l.type?.y ?? -1, l.type?.w ?? -1, l.hero ? l.hero.x + l.hero.w / 2 : -1, l.hero ? l.hero.y + l.hero.h / 2 : -1, l.hero?.w ?? -1];
  const close = (a: number[], b: number[]) => a.every((v, i) => Math.abs(v - b[i]) < 0.08);
  let best: typeof holds = [];
  for (const h of holds) {
    const group = holds.filter((x) => close(sig(x.layout), sig(h.layout)));
    if (group.length > best.length) best = group;
  }
  // The slide template: the frame's biggest line centred in its top third, the content stacked under it, beat after beat.
  const slides = holds.filter(({ layout: l }) => l.type && l.hero && Math.abs(l.type.x + l.type.w / 2 - 0.5) < 0.12 && l.type.y < 0.3 && l.type.y + 0.02 < l.hero.y);
  if (slides.length >= 3 && slides.length >= holds.length * 0.6)
    return [`frame ${slides[0].frame}: ${slides.map((h) => h.beat).join(", ")} are the same slide: a centred title across the top with the content stacked under it. Break the template: put the subject full-bleed or cropped close and lay the words on or beside it, move the hero to a side, and never stack a title over a box twice in a row`];
  if (best.length < 3 || best.length < holds.length * 0.6) return [];
  return [`frame ${best[0].frame}: ${best.map((h) => h.beat).join(", ")} share one layout (the headline in the same place, the same panel at the same size and position): stations in a row must differ in composition; move the hero (left, right, full-bleed, cropped close), change its scale, and let the words sit beside the thing they are about`];
}

/** A brightness change (0 to 255) at least this large between two samples is a flip; this many flips in a second is three flashes. */
const FLASH_STEP = 25;
const FLASH_FLIPS = 6;

/**
 * Where a film flashes: in any region of a 4 x 4 grid, six or more light/dark flips (three flashes, WCAG's
 * limit) within one second of samples. `samples` are each sampled frame's 16 region brightnesses, in order.
 */
export function flashes(samples: { frame: number; grid: number[] }[], fps: number, every: number): string[] {
  const per = Math.max(2, Math.round(fps / every));
  const out: string[] = [];
  let last = -Infinity;
  for (let r = 0; r < 16; r++) {
    const flips: number[] = [];
    let dir = 0;
    for (let i = 1; i < samples.length; i++) {
      const d = samples[i].grid[r] - samples[i - 1].grid[r];
      if (Math.abs(d) < FLASH_STEP) continue;
      const s = Math.sign(d);
      if (s !== dir) flips.push(i);
      dir = s;
    }
    for (let k = FLASH_FLIPS - 1; k < flips.length; k++) {
      if (flips[k] - flips[k - FLASH_FLIPS + 1] > per) continue;
      const a = samples[flips[k - FLASH_FLIPS + 1] - 1].frame;
      const b = samples[flips[k]].frame;
      if (a - last < fps) break;
      last = a;
      out.push(`frames ${a} to ${b} flip between light and dark at least three times in a second`);
      break;
    }
  }
  return out.slice(0, 3);
}

/** A pixel changed when its brightness moved more than this (0 to 255) between two samples. */
const STILL_STEP = 12;
/** A sample stood still when less than this share of its pixels changed (the scenario-kinetic-film skill's finish.py: 1.5 %). */
export const STILL_SHARE = 0.015;
/** Longest a kinetic film may stand still before its close, and the share of still samples it may have (finish.py's gates). */
export const PARK_SECONDS = 0.6;
export const STILL_MAX = 0.4;

/**
 * How much of a film stands still, from small brightness samples taken `every` frames apart: the share
 * of samples that barely changed from the one before, and the longest run of them, counted up to frame
 * `until` (the close, where a film may rest).
 */
export function stillness(samples: { frame: number; luma: number[] }[], until: number): { share: number; longest: [number, number] | null } {
  let still = 0;
  let counted = 0;
  let run: number | null = null;
  let longest: [number, number] | null = null;
  for (let i = 1; i < samples.length && samples[i].frame <= until; i++) {
    const a = samples[i - 1].luma;
    const b = samples[i].luma;
    let changed = 0;
    for (let k = 0; k < a.length; k++) if (Math.abs(a[k] - b[k]) > STILL_STEP) changed++;
    counted++;
    if (changed / (a.length || 1) < STILL_SHARE) {
      still++;
      run ??= samples[i - 1].frame;
      if (!longest || samples[i].frame - run > longest[1] - longest[0]) longest = [run, samples[i].frame];
    } else run = null;
  }
  return { share: counted ? still / counted : 0, longest };
}

/** What a kinetic film's stillness breaks of the style's gates, as warnings for the designer. */
export function parked(s: { share: number; longest: [number, number] | null }, fps: number): string[] {
  const out: string[] = [];
  if (s.longest && s.longest[1] - s.longest[0] > PARK_SECONDS * fps)
    out.push(`frames ${s.longest[0]} to ${s.longest[1]} stand still for ${((s.longest[1] - s.longest[0]) / fps).toFixed(1)} s (a kinetic film never parks over ${PARK_SECONDS} s before its logo card): give that stretch the next shot, a camera drift, sliding ghost rows or a word that keeps scaling`);
  if (s.share > STILL_MAX) out.push(`${Math.round(s.share * 100)} % of the film stands still (at most ${STILL_MAX * 100} % for a kinetic film): cut on more beats and keep every hold moving`);
  return out;
}

/** Two holds of one beat at least this many frames apart that print the same: the beat stood still. */
export const FROZEN_FRAMES = 30;
/** How long a hold may stand still at each pace: a calm film holds still on purpose so its words are read. */
export const FROZEN_BY_PACE: Record<"calm" | "balanced" | "lively" | "loud", number> = { calm: 75, balanced: 54, lively: 30, loud: 30 };

/** How far (a share of the station) a box may shift, or an opacity change, and still count as unmoved. */
const STILL = 0.003;

/** Whether two prints show the same thing: the same elements, none moved, resized, faded or redrawn by more than a hair. */
export function samePrint(a: Print, b: Print): boolean {
  if (a.keys.length !== b.keys.length || a.nums.length !== b.nums.length) return false;
  for (let i = 0; i < a.keys.length; i++) if (a.keys[i] !== b.keys[i]) return false;
  for (let i = 0; i < a.nums.length; i++) if (Math.abs(a.nums[i] - b.nums[i]) > STILL) return false;
  return true;
}

/**
 * Beats that freeze: two of their stills at least FROZEN_FRAMES apart print the same, so after its
 * entrance nothing on the beat's station moved, counted, drew or changed (the camera's push aside).
 * The close is left out: a final lockup may hold. One warning names them all, at the first frozen frame.
 */
export function frozenBeats(beats: { id: string; start: number; end: number }[], prints: Map<number, Map<string, Print>>, limit = FROZEN_FRAMES): string[] {
  const frames = [...prints.keys()].sort((a, b) => a - b);
  const spans: string[] = [];
  let first: number | null = null;
  for (const b of beats.slice(0, -1)) {
    const own = frames.filter((f) => f >= b.start && f < b.end);
    let longest: [number, number] | null = null;
    let from = 0;
    for (let i = 1; i < own.length; i++) {
      const pa = prints.get(own[i - 1]);
      const pb = prints.get(own[i]);
      const a = pa?.get(b.id) ?? pa?.get("*");
      const c = pb?.get(b.id) ?? pb?.get("*");
      if (!a || !c || !samePrint(a, c)) {
        from = i;
        continue;
      }
      if (own[i] - own[from] >= limit && (!longest || own[i] - own[from] > longest[1] - longest[0])) longest = [own[from], own[i]];
    }
    if (!longest) continue;
    first ??= longest[1];
    spans.push(`${b.id} (frames ${longest[0]} to ${longest[1]}, ${((longest[1] - longest[0]) / FILM_FPS).toFixed(1)} s)`);
  }
  if (!spans.length || first === null) return [];
  return [
    `frame ${first}: the film freezes like slides: ${spans.join(", ")} hold${spans.length === 1 ? "s" : ""} perfectly still after the entrance (nothing moves, counts, draws or changes; the camera's push does not count). A beat is a shot, not a slide: keep the line being read still, and give the hold a second action that carries the beat's idea (the number counts on, the next row lands, a line draws to the next thing, the cursor clicks, a stamp lands, the hero turns or travels toward the next station)`,
  ];
}

/** A canvas's drawing as two numbers: its mean coverage and brightness on a 16 x 9 sample. */
function canvasSample(c: HTMLCanvasElement): number[] {
  try {
    const s = document.createElement("canvas");
    s.width = 16;
    s.height = 9;
    const ctx = s.getContext("2d");
    if (!ctx || !c.width || !c.height) return [0, 0];
    ctx.drawImage(c, 0, 0, 16, 9);
    const px = ctx.getImageData(0, 0, 16, 9).data;
    let a = 0;
    let y = 0;
    for (let i = 0; i < px.length; i += 4) {
      a += px[i + 3];
      y += (0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2]) * (px[i + 3] / 255);
    }
    return [a / (144 * 255), y / (144 * 255)];
  } catch {
    return [0, 0];
  }
}

/** The print of every station on this still (the whole frame when there is no World). */
function prints(root: HTMLElement): Map<string, Print> {
  const out = new Map<string, Print>();
  const stations = [...root.querySelectorAll<HTMLElement>("[data-station]")];
  const groups: [string, HTMLElement][] = stations.length ? stations.map((s) => [s.dataset.station ?? "", s]) : [["*", root]];
  for (const [id, host] of groups) {
    const ref = host.getBoundingClientRect();
    if (ref.width < 1 || ref.height < 1) continue;
    const keys: string[] = [];
    const nums: number[] = [];
    let n = 0;
    for (const el of host.querySelectorAll("*")) {
      if (++n > MAX_ELEMENTS) break;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      keys.push(`${el.tagName}|${ownText(el)}|${cs.transform}|${cs.clipPath}|${cs.strokeDashoffset}|${cs.backgroundColor}|${cs.color}`);
      nums.push((r.left - ref.left) / ref.width, (r.top - ref.top) / ref.height, r.width / ref.width, r.height / ref.height, Number(cs.opacity || 1));
      if (el instanceof HTMLCanvasElement) nums.push(...canvasSample(el));
    }
    out.set(id, { keys, nums });
  }
  return out;
}

const MAX_ELEMENTS = 2000;
/** Rendered text shorter than this (px, at full size) is hard to read on a phone: 40 px in portrait, 28 in landscape and square. */
const minTextPx = (portrait: boolean) => (portrait ? 40 : 28);

const ownText = (el: Element) =>
  [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent ?? "")
    .join("")
    .trim();

function opacityOf(el: Element, root: Element): number {
  let o = 1;
  for (let x: Element | null = el; x && x !== root; x = x.parentElement) o *= Number(getComputedStyle(x).opacity || 1);
  return o;
}

function scan(root: HTMLElement, width: number, frame: number) {
  const box = root.getBoundingClientRect();
  const scale = box.width / width || 1;
  const seen = new Set<string>();
  const warn = (msg: string) => {
    if (seen.has(msg)) return;
    seen.add(msg);
    qaWarnings.push(`frame ${frame}: ${msg}`);
  };
  // A second copy of a layer drawn for an effect (data-qa="echo": the other half of a cut, a trail) is not read twice.
  const echo = (el: Element) => el.closest('[data-qa="echo"]') !== null;
  // Text under an opaque layer painted later (a cover, a card over it) is not seen: it is left out.
  const covers = [...root.querySelectorAll("*")].filter((el) => {
    if (echo(el)) return false;
    const bg = /rgba?\(([^)]+)\)/.exec(getComputedStyle(el).backgroundColor)?.[1].split(",").map(Number);
    return bg && (bg.length < 4 || bg[3] >= 0.95) && opacityOf(el, root) >= 0.95;
  });
  const hidden = (el: Element, r: DOMRect) => {
    const cx = (r.left + r.right) / 2;
    const cy = (r.top + r.bottom) / 2;
    return covers.some((c) => {
      if (c.contains(el) || !(el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)) return false;
      const cr = c.getBoundingClientRect();
      return cx > cr.left && cx < cr.right && cy > cr.top && cy < cr.bottom;
    });
  };
  let n = 0;
  const texts: TextBox[] = [];
  /** Panels already reported as spilling: one warning each, not one per line inside. */
  const spilled = new Set<Element>();
  for (const el of root.querySelectorAll("*")) {
    if (++n > MAX_ELEMENTS) break;
    if (echo(el)) continue;
    const text = ownText(el);
    const fit = el instanceof HTMLElement && el.dataset.fit === "1";
    if (!text && !fit) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const inside = r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
    if (!inside || opacityOf(el, root) < 0.5) continue;
    const label = `"${(text || el.textContent || "").trim().slice(0, 40)}"`;
    // Text a later opaque card is drawn over is not read. Covered for the most part (not a strike line or a pill edge across it), it is a collision: two things stacked in one place.
    if (hidden(el, r)) {
      if (text && text.length > 1 && covering(el, r, covers) >= 0.6) warn(`text ${label} is covered by another element drawn over it`);
      continue;
    }
    const edge = r.left < box.left - 2 ? "left" : r.right > box.right + 2 ? "right" : r.top < box.top - 2 ? "top" : r.bottom > box.bottom + 2 ? "bottom" : null;
    if (edge) warn(`text ${label} is cut by the ${edge} edge of the frame`);
    if (fit && el.scrollWidth > el.clientWidth + 2) warn(`text ${label} is clipped by its own box`);
    else if (text && !edge) {
      const cut = clippedBy(el, r, root, box);
      const panel = cut ? null : spills(el, r, root, box);
      if (cut) warn(`text ${label} is cut off by its container (a box with overflow hidden, ${Math.round(cut / scale)} px too narrow): widen the box or let the words set its width`);
      else if (panel && !spilled.has(panel)) {
        spilled.add(panel);
        warn(`text ${label} spills out of its panel: the panel is smaller than what it holds; size the panel to its content, or shrink the content`);
      }
    }
    if (text && r.height / scale < minTextPx(box.height > box.width)) warn(`text ${label} renders ${Math.round(r.height / scale)} px tall: too small to read`);
    if (text) {
      const block = blockOf(el, root);
      texts.push({ el, r, block });
      // A line set letter by letter (a span per character) is read whole, as its line: "S W E L L" is "SWELL".
      qaSeen.push(block !== el && block !== root ? (block.textContent ?? text).trim() : text);
    }
  }
  collisions(texts, root, warn);
  repeats(texts, warn);
  strokesOverText(texts, root, warn);
  emptyCards(root, box, scale, covers, warn);
  qaPrints.set(frame, prints(root));
  const layout = layoutOf(root, box, texts, scale);
  qaLayouts.set(frame, layout);
  const small = smallHero(layout, box.height / scale);
  if (small) warn(small);
}

/**
 * Cards that hold nothing: an opaque, card-shaped box (a panel, a sheet, a tile) at least a few
 * percent of the frame with no words, picture or drawing in it. A blank sheet standing in for a
 * receipt or a logo reads as unfinished.
 */
function emptyCards(root: HTMLElement, box: DOMRect, scale: number, covers: Element[], warn: (m: string) => void) {
  const frame = box.width * box.height;
  for (const el of covers) {
    if (el === root) continue;
    const r = el.getBoundingClientRect();
    // A sheet mostly behind another card is that card's stack or shadow, not an empty card.
    if (covering(el, r, covers) >= 0.5) continue;
    const w = r.width / box.width;
    const h = r.height / box.height;
    const visible = r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
    // Card-sized: not a hairline, a bar or a dot, and not the background of a whole frame.
    if (!visible || w < 0.06 || h < 0.08 || (r.width * r.height) / frame > 0.6 || r.width / r.height > 6 || r.height / r.width > 6) continue;
    if ((el.textContent ?? "").trim()) continue;
    if (el.querySelector("img, canvas, svg, video, picture")) continue;
    // The background layer of a card whose words sit beside it, in the same parent.
    const parent = el.parentElement;
    if (parent && parent !== root && area(r) >= 0.8 * area(parent.getBoundingClientRect()) && ((parent.textContent ?? "").trim() || parent.querySelector("img, canvas, svg, video, picture"))) continue;
    const cs = getComputedStyle(el);
    if (cs.backgroundImage && cs.backgroundImage !== "none") continue;
    // A card has a card's edge (rounded corners, a shadow or a border): a flat colour field is a layout block, not a card.
    const edged = parseFloat(cs.borderTopLeftRadius) > 0 || (cs.boxShadow && cs.boxShadow !== "none") || parseFloat(cs.borderTopWidth) > 0;
    if (!edged) continue;
    warn(`an empty card (${Math.round(r.width / scale)} x ${Math.round(r.height / scale)} px) holds nothing: put real content in it (a logo, words, a drawing) or remove it`);
  }
}

/** The frame's largest panel or object (a fill, a border, a picture) and its largest line of type. */
function layoutOf(root: HTMLElement, box: DOMRect, texts: TextBox[], scale: number): Layout {
  const share = (r: DOMRect) => ({ x: (r.left - box.left) / box.width, y: (r.top - box.top) / box.height, w: r.width / box.width, h: r.height / box.height });
  let hero: DOMRect | null = null;
  let n = 0;
  for (const el of root.querySelectorAll("*")) {
    if (++n > MAX_ELEMENTS) break;
    const media = /^(IMG|SVG|CANVAS|VIDEO)$/i.test(el.tagName);
    if (!media && !boxed(getComputedStyle(el))) continue;
    const r = el.getBoundingClientRect();
    const marked = el instanceof HTMLElement && el.dataset.qa === "hero";
    if (r.width < box.width * 0.04 || r.height < box.height * 0.04 || (stageSized(r, box) && !marked)) continue;
    if (r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom || opacityOf(el, root) < 0.5) continue;
    // A drawing canvas spanning the frame (lines, wires) is not a panel.
    // A canvas marked as the frame's subject (a map) is the hero however big it is.
    if (media && el.tagName === "CANVAS" && r.width * r.height > box.width * box.height * 0.5 && !marked) continue;
    if (!hero || r.width * r.height > hero.width * hero.height) hero = r;
  }
  let type: TextBox | null = null;
  for (const t of texts) if (!type || t.r.height > type.r.height) type = t;
  return { hero: hero ? share(hero) : null, type: type ? { ...share(type.block.getBoundingClientRect()), px: type.r.height / scale } : null, sheet: type ? sheeted(type.el, root, box) : false };
}

/** Whether a line of type sits on an edged sheet (a border or a shadow) covering most of the frame. */
function sheeted(el: Element, root: Element, box: DOMRect): boolean {
  for (let x = el.parentElement; x && x !== root; x = x.parentElement) {
    const cs = getComputedStyle(x);
    const edged = parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0 || (cs.boxShadow && cs.boxShadow !== "none");
    if (!edged) continue;
    const r = x.getBoundingClientRect();
    const w = Math.min(r.right, box.right) - Math.max(r.left, box.left);
    const h = Math.min(r.bottom, box.bottom) - Math.max(r.top, box.top);
    if (w > 0 && h > 0 && (w * h) / (box.width * box.height) >= SHEET_SHARE) return true;
  }
  return false;
}

/** A box most of the frame wide and tall: the stage, a backdrop or the world, not a panel. */
const stageSized = (a: DOMRect, box: DOMRect) => a.width >= box.width * 0.9 && a.height >= box.height * 0.8;

/**
 * How far (px) an ancestor with overflow hidden cuts a line of text at its side: a mask or a card
 * narrower than its words shows "NaraRoute" for "NaraRouter". Only the sides: masks hide a rise
 * from below by design.
 */
function clippedBy(el: Element, r: DOMRect, root: Element, box: DOMRect): number {
  for (let x = el.parentElement; x && x !== root; x = x.parentElement) {
    if (getComputedStyle(x).overflowX === "visible") continue;
    const a = x.getBoundingClientRect();
    if (stageSized(a, box) || r.right <= a.left || r.left >= a.right) continue;
    const over = Math.max(a.left - r.left, r.right - a.right);
    if (over > 3) return over;
  }
  return 0;
}

const boxed = (cs: CSSStyleDeclaration) => {
  const bg = /rgba?\(([^)]+)\)/.exec(cs.backgroundColor)?.[1].split(",").map(Number);
  return Boolean(bg && (bg.length < 4 || bg[3] > 0.05)) || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderBottomWidth) > 0;
};

/**
 * Text that runs out of the panel it sits in: the nearest ancestor drawn as a box (a fill or a
 * border) lets its content overflow below or beside it, like code lines under a code window.
 * Text placed on purpose (absolutely positioned between it and the box) is left alone. Returns the panel.
 */
function spills(el: Element, r: DOMRect, root: Element, box: DOMRect): Element | null {
  if (getComputedStyle(el).position === "absolute") return null;
  for (let x = el.parentElement; x && x !== root; x = x.parentElement) {
    const cs = getComputedStyle(x);
    if (!boxed(cs)) {
      if (cs.position === "absolute" || cs.position === "fixed") return null;
      continue;
    }
    const a = x.getBoundingClientRect();
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible" || stageSized(a, box) || r.top >= a.bottom - 2) return null;
    return r.bottom > a.bottom + 6 || r.right > a.right + 6 ? x : null;
  }
  return null;
}

/** The largest share (0..1) of an element's box that one opaque element painted after it covers. */
function covering(el: Element, r: DOMRect, covers: Element[]): number {
  const own = area(r);
  if (!own) return 0;
  let most = 0;
  for (const c of covers) {
    if (c === el || c.contains(el) || el.contains(c) || !(el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING)) continue;
    most = Math.max(most, overlap(r, c.getBoundingClientRect()) / own);
  }
  return most;
}

type TextBox = { el: Element; r: DOMRect; block: Element };

/** The nearest ancestor laid out as a block: per-letter spans of one line belong to the same block. */
function blockOf(el: Element, root: Element): Element {
  for (let x: Element | null = el; x && x !== root; x = x.parentElement) {
    const d = getComputedStyle(x).display;
    if (d !== "inline" && d !== "inline-block" && d !== "contents") return x;
  }
  return root;
}

const area = (a: { left: number; right: number; top: number; bottom: number }) => Math.max(0, a.right - a.left) * Math.max(0, a.bottom - a.top);
const overlap = (a: DOMRect, b: DOMRect) => area({ left: Math.max(a.left, b.left), right: Math.min(a.right, b.right), top: Math.max(a.top, b.top), bottom: Math.min(a.bottom, b.bottom) });
const labelOf = (el: Element) => `"${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;

/** Two separate lines of text drawn over each other. */
function collisions(texts: TextBox[], root: Element, warn: (m: string) => void) {
  const blocks = new Map<Element, DOMRect[]>();
  for (const t of texts) blocks.set(t.block, [...(blocks.get(t.block) ?? []), t.r]);
  const list = [...blocks.entries()].filter(([b]) => b !== root);
  for (let i = 0; i < list.length; i++) {
    for (let k = i + 1; k < list.length; k++) {
      const [a, ra] = list[i];
      const [b, rb] = list[k];
      if (a.contains(b) || b.contains(a)) continue;
      let hit = 0;
      let small = Infinity;
      for (const x of ra) for (const y of rb) {
        hit += overlap(x, y);
        small = Math.min(small, area(x), area(y));
      }
      if (small > 0 && hit > small * 0.25) warn(`text ${labelOf(a)} and text ${labelOf(b)} overlap`);
    }
  }
}

/** Prices, percentages, big counts and model-style ids: the things a frame should say once. */
const FIGURE = /(?:US)?\$\s?\d[\d.,]*|\d+(?:[.,]\d+)?\s?%|\d+(?:[.,]\d+)?\s?[MKB]\b|[a-z0-9]+(?:[-.][a-z0-9]+){3,}/gi;

/** The figures shown by `times` or more separate blocks of a frame's words, with how many show each. */
export function repeatedFigures(blocks: string[], times = 3): [string, number][] {
  const seen = new Map<string, number>();
  for (const b of blocks) for (const f of new Set((b.match(FIGURE) ?? []).map((x) => x.replace(/\s+/g, "").replace(/^US/i, "").replace(/[.,]+$/, "").toLowerCase()))) seen.set(f, (seen.get(f) ?? 0) + 1);
  return [...seen].filter(([, n]) => n >= times);
}

/** The same figure in three or more places of one frame: a headline, a chip and a footer all saying "$0.2". */
function repeats(texts: TextBox[], warn: (m: string) => void) {
  const blocks = [...new Set(texts.map((t) => t.block))].map((b) => b.textContent ?? "");
  for (const [f, n] of repeatedFigures(blocks)) warn(`"${f}" appears in ${n} places in one frame (a headline, a chip and a label all saying it): say it once where it lands hardest, and let the other places carry something else or nothing`);
}

/** A line drawn on a canvas painted over text (later in the page, so on top of it). Strike marks are meant to. */
function strokesOverText(texts: TextBox[], root: Element, warn: (m: string) => void) {
  for (const c of root.querySelectorAll("canvas")) {
    if ((c as HTMLElement).dataset.strike === "1" || c.width === 0 || c.height === 0) continue;
    const cr = c.getBoundingClientRect();
    if (cr.width < 2 || cr.height < 2) continue;
    let ctx: CanvasRenderingContext2D | null = null;
    try {
      ctx = c.getContext("2d");
    } catch {
      ctx = null;
    }
    if (!ctx) continue;
    const sx = c.width / cr.width;
    const sy = c.height / cr.height;
    for (const t of texts) {
      // Only canvases after the text in the page paint over it.
      if (!(t.el.compareDocumentPosition(c) & Node.DOCUMENT_POSITION_FOLLOWING) || t.el.contains(c)) continue;
      const left = Math.max(cr.left, t.r.left);
      const right = Math.min(cr.right, t.r.right);
      const top = Math.max(cr.top, t.r.top);
      const bottom = Math.min(cr.bottom, t.r.bottom);
      if (right - left < 4 || bottom - top < 4) continue;
      const x = Math.floor((left - cr.left) * sx);
      const y = Math.floor((top - cr.top) * sy);
      const w = Math.max(1, Math.floor((right - left) * sx));
      const h = Math.max(1, Math.floor((bottom - top) * sy));
      let data: Uint8ClampedArray;
      try {
        data = ctx.getImageData(x, y, w, h).data;
      } catch {
        continue;
      }
      let inked = 0;
      let seen = 0;
      for (let i = 3; i < data.length; i += 4 * 3) {
        seen++;
        if (data[i] > 96) inked++;
      }
      if (seen && inked / seen > 0.03) warn(`a drawn line runs over text ${labelOf(t.el)}`);
    }
  }
}

/** Put after the scene: scans the rendered frame when this render is a QA still. */
export const QaProbe = ({ root, width, on }: { root: RefObject<HTMLDivElement | null>; width: number; on: boolean }) => {
  const frame = useCurrentFrame();
  useLayoutEffect(() => {
    if (on && root.current) scan(root.current, width, frame);
  });
  return null;
};
