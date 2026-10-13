import { useLayoutEffect, type RefObject } from "react";
import { useCurrentFrame } from "remotion";

/**
 * Automated QA on the frames rendered for the model: text cut by the frame
 * edge, text clipped by its own box, text too small to read. The model sees
 * these warnings next to the pictures, which catch most but not all of it.
 */

/** Warnings from the stills being rendered now; the sandbox empties it before a job and reads it after. */
export const qaWarnings: string[] = [];

const MAX_ELEMENTS = 2000;
/** Rendered text shorter than this (px, at full size) is hard to read on a phone. */
const MIN_TEXT_PX = 16;

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
  for (const el of root.querySelectorAll("*")) {
    if (++n > MAX_ELEMENTS) break;
    const text = ownText(el);
    const fit = el instanceof HTMLElement && el.dataset.fit === "1";
    if (!text && !fit) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    const inside = r.right > box.left && r.left < box.right && r.bottom > box.top && r.top < box.bottom;
    if (!inside || opacityOf(el, root) < 0.5 || hidden(el, r)) continue;
    const label = `"${(text || el.textContent || "").trim().slice(0, 40)}"`;
    const edge = r.left < box.left - 2 ? "left" : r.right > box.right + 2 ? "right" : r.top < box.top - 2 ? "top" : r.bottom > box.bottom + 2 ? "bottom" : null;
    if (edge) warn(`text ${label} is cut by the ${edge} edge of the frame`);
    if (fit && el.scrollWidth > el.clientWidth + 2) warn(`text ${label} is clipped by its own box`);
    if (text && r.height / scale < MIN_TEXT_PX) warn(`text ${label} renders ${Math.round(r.height / scale)} px tall: too small to read`);
    if (text) texts.push({ el, r, block: blockOf(el, root) });
  }
  collisions(texts, root, warn);
  strokesOverText(texts, root, warn);
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
