import { useLayoutEffect, type RefObject } from "react";
import { useCurrentFrame } from "remotion";

/**
 * Automated QA on the frames rendered for the model: text cut by the frame
 * edge, text clipped by its own box, text too small to read. The model sees
 * these warnings next to the pictures, which catch most but not all of it.
 */

/** Warnings from the stills being rendered now; the sandbox empties it before a job and reads it after. */
export const qaWarnings: string[] = [];

const MAX_ELEMENTS = 600;
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
  let n = 0;
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
    const edge = r.left < box.left - 2 ? "left" : r.right > box.right + 2 ? "right" : r.top < box.top - 2 ? "top" : r.bottom > box.bottom + 2 ? "bottom" : null;
    if (edge) warn(`text ${label} is cut by the ${edge} edge of the frame`);
    if (fit && el.scrollWidth > el.clientWidth + 2) warn(`text ${label} is clipped by its own box`);
    if (text && r.height / scale < MIN_TEXT_PX) warn(`text ${label} renders ${Math.round(r.height / scale)} px tall: too small to read`);
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
