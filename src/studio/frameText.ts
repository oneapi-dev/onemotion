"use client";

/**
 * Reading the preview the way a viewer sees it: scenes stack their next
 * shot, invisible, over the current one, so only text in elements that are
 * not hidden or see-through counts.
 */

/** How visible an element is: its opacity times its ancestors' up to the frame, 0 when hidden. */
function shownAmount(el: HTMLElement, frame: HTMLElement): number {
  let o = 1;
  for (let e: HTMLElement | null = el; e && e !== frame; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (cs.visibility === "hidden" || cs.display === "none") return 0;
    o *= Number(cs.opacity);
  }
  return o;
}

/**
 * Whether a viewer can see an element: not hidden or see-through, inside
 * the frame, and not clipped away (a clipped element takes no hits where it
 * is clipped, so its middle is tested).
 */
function seen(el: HTMLElement, frame: HTMLElement, box: DOMRect): boolean {
  if (shownAmount(el, frame) < 0.05) return false;
  const r = el.getBoundingClientRect();
  const x = Math.min(Math.max(r.left + r.width / 2, box.left + 1), box.right - 1);
  const y = Math.min(Math.max(r.top + r.height / 2, box.top + 1), box.bottom - 1);
  if (r.right <= box.left || r.left >= box.right || r.bottom <= box.top || r.top >= box.bottom || !r.width || !r.height) return false;
  // An element that takes no clicks at all cannot be hit-tested: inside the frame and opaque is enough.
  if (getComputedStyle(el).pointerEvents === "none") return true;
  return document.elementsFromPoint(x, y).some((h) => h === el || el.contains(h));
}

/** The words a viewer can read on the preview's current frame (or in one element of it, `root`). */
export function visibleText(frame: HTMLElement | null, root: HTMLElement | null = frame): string {
  if (!frame || !root) return "";
  const out: string[] = [];
  const box = frame.getBoundingClientRect();
  const cache = new Map<HTMLElement, boolean>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent?.trim();
    const el = n.parentElement;
    if (!text || !el) continue;
    const shown = cache.get(el) ?? seen(el, frame, box);
    cache.set(el, shown);
    if (shown) out.push(text);
  }
  return out.join(" ");
}

/**
 * The words under a click on the preview: the topmost element there that a
 * viewer can see and that shows text, widened to the whole line when the
 * text is split into letters or words. A click on the backdrop (an element
 * covering most of the frame) is on no words.
 */
export function wordsAt(x: number, y: number, frame: HTMLElement): string {
  const box = frame.getBoundingClientRect();
  const area = box.width * box.height;
  for (const hit of document.elementsFromPoint(x, y)) {
    if (!(hit instanceof HTMLElement) || !frame.contains(hit) || hit === frame) continue;
    if (shownAmount(hit, frame) < 0.05) continue;
    const r = hit.getBoundingClientRect();
    if (r.width * r.height > area * 0.5) return "";
    if (!/\p{L}/u.test(visibleText(frame, hit))) continue;
    let el: HTMLElement = hit;
    while (el.parentElement && el.parentElement !== frame && visibleText(frame, el).length < 3) el = el.parentElement;
    while (el.parentElement && el.parentElement !== frame && !/\s/.test(visibleText(frame, el)) && visibleText(frame, el.parentElement).length <= 80) el = el.parentElement;
    return visibleText(frame, el);
  }
  return "";
}
