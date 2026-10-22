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

/** Two holds of one beat at least this many frames apart that print the same: the beat stood still. */
export const FROZEN_FRAMES = 30;

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
export function frozenBeats(beats: { id: string; start: number; end: number }[], prints: Map<number, Map<string, Print>>): string[] {
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
      if (own[i] - own[from] >= FROZEN_FRAMES && (!longest || own[i] - own[from] > longest[1] - longest[0])) longest = [own[from], own[i]];
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
  // Text under an opaque layer painted later (a cover, a card over it) is not seen: it is left out.
  const covers = [...root.querySelectorAll("*")].filter((el) => {
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
      texts.push({ el, r, block: blockOf(el, root) });
      qaSeen.push(text);
    }
  }
  collisions(texts, root, warn);
  repeats(texts, warn);
  strokesOverText(texts, root, warn);
  emptyCards(root, box, scale, covers, warn);
  qaPrints.set(frame, prints(root));
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
