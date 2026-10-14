import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { parse } from "node-html-parser";
import { Agent, fetch } from "undici";
import type { SiteInfo } from "@/director/input";
import { normalizeHex } from "@/director/text";

/**
 * Reads a website a brief names: its name, copy, brand color and logo. The
 * address comes from a stranger, so every hop is vetted: http(s) on the
 * usual ports only, every resolved address public, and the connection
 * pinned to the address that was vetted (no DNS rebinding between the check
 * and the connect).
 */

export class SiteError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SiteError";
  }
}

const MAX_PAGE = 2 * 1024 * 1024;
const MAX_LOGO = 300 * 1024;
const TIMEOUT = 10_000;

function privateV4(ip: string): boolean {
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 192 && b === 0) || (a === 198 && (b === 18 || b === 19)) || a >= 224
  );
}

function privateV6(ip: string): boolean {
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(v);
  if (mapped) return privateV4(mapped[1]);
  return /^(fc|fd|fe8|fe9|fea|feb|ff)/.test(v) || v.startsWith("64:ff9b") || v.startsWith("2001:db8");
}

const blocked = (ip: string) => (isIP(ip) === 6 ? privateV6(ip) : privateV4(ip));

/** Resolves a host and refuses it unless every address is public. */
async function vet(url: URL): Promise<{ address: string; family: number }> {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new SiteError("Only http and https websites can be read.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new SiteError("Only websites on the usual ports can be read.");
  if (url.username || url.password) throw new SiteError("Addresses with a login in them cannot be read.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [{ address: host, family: isIP(host) }] : await lookup(host, { all: true }).catch(() => []);
  if (!addrs.length) throw new SiteError("That website could not be found.");
  if (addrs.some((a) => blocked(a.address))) throw new SiteError("That address points to a private network.");
  return addrs[0];
}

/** GET with the connection pinned to a vetted address; follows up to 4 redirects. */
export async function get(raw: string, limit: number, accept: string): Promise<{ url: URL; type: string; body: Buffer }> {
  let url = new URL(raw);
  for (let hop = 0; hop < 5; hop++) {
    const pinned = await vet(url);
    const dispatcher = new Agent({
      connect: {
        lookup: (_host, _opts, cb) => cb(null, [{ address: pinned.address, family: pinned.family }] as never),
      },
    });
    try {
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT),
        headers: { Accept: accept, "User-Agent": "Mozilla/5.0 (compatible; oneapi-motion/0.1; +https://motion.oneapi.id)" },
        dispatcher,
      });
      if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
        url = new URL(res.headers.get("location") as string, url);
        continue;
      }
      if (!res.ok) throw new SiteError(`That website answered ${res.status}.`);
      const reader = res.body?.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (reader) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > limit) {
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
      return { url, type: res.headers.get("content-type") ?? "", body: Buffer.concat(chunks) };
    } finally {
      void dispatcher.close();
    }
  }
  throw new SiteError("That website redirects too many times.");
}

const clean = (s: string | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))];

/** Accepts "oneapi.id", "https://oneapi.id/pricing" and the like. */
export function normalizeAddress(raw: string): string {
  const v = raw.trim();
  if (!v) throw new SiteError("Enter a website address.");
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    return new URL(withScheme).toString();
  } catch {
    throw new SiteError("That is not a website address.");
  }
}

export async function readSite(raw: string): Promise<SiteInfo> {
  const page = await get(normalizeAddress(raw), MAX_PAGE, "text/html,application/xhtml+xml");
  if (!/html/i.test(page.type)) throw new SiteError("That address is not a web page.");
  const doc = parse(page.body.toString("utf8"));
  const meta = (sel: string) => clean(doc.querySelector(sel)?.getAttribute("content"));
  const domain = page.url.hostname.replace(/^www\./, "");
  const title = clean(doc.querySelector("title")?.text);
  const siteName = meta('meta[property="og:site_name"]');
  const fromTitle = clean(title.split(/\s[|\-–—:·]\s/)[0]);
  const name = siteName || (fromTitle && fromTitle.length <= 32 ? fromTitle : "") || domain.split(".")[0].replace(/^\w/, (c) => c.toUpperCase());

  // Images before the page is stripped: icons, the share image, pictures with their alt text, logos first.
  const images = uniq(
    [
      ...doc.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]').map((l) => `${l.getAttribute("href") ?? ""}\u0000${name} icon`),
      `${meta('meta[property="og:image"]')}\u0000share image`,
      ...doc.querySelectorAll("img").map((i) => `${i.getAttribute("src") ?? i.getAttribute("data-src") ?? ""}\u0000${clean(i.getAttribute("alt"))}`),
    ].filter((x) => !x.startsWith("\u0000") && !x.startsWith("data:")),
  )
    .map((x) => {
      const [src, alt] = x.split("\u0000");
      try {
        return { src: new URL(src, page.url).toString(), alt: alt.slice(0, 80) };
      } catch {
        return null;
      }
    })
    .filter((x): x is { src: string; alt: string } => Boolean(x))
    .sort((a, b) => Number(/logo/i.test(b.src + b.alt)) - Number(/logo/i.test(a.src + a.alt)))
    .slice(0, 30);

  for (const el of doc.querySelectorAll("script, style, noscript, svg")) el.remove();
  // Block elements on their own lines, so "Pro" and "$12" in two cards do not run together.
  const body = doc.querySelector("body") ?? doc;
  const text = body.structuredText
    .split("\n")
    .map((l) => clean(l))
    .filter(Boolean)
    .join(" · ")
    .slice(0, 6000);
  const headings = uniq(doc.querySelectorAll("h1, h2, h3").map((h) => clean(h.text))).filter((t) => t.length > 2 && t.length < 140);
  const paragraphs = uniq(doc.querySelectorAll("p, li").map((p) => clean(p.text))).filter((t) => t.length >= 25 && t.length <= 320);
  const ctas = uniq(doc.querySelectorAll("a, button").map((a) => clean(a.text))).filter((t) => t.length >= 2 && t.length <= 28);

  // The logo: a touch icon first (square, sized for display), then the
  // largest declared icon. Kept as a data URL so a saved project needs no
  // second fetch, and so the browser exporter can draw it.
  const icons = doc
    .querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="apple-touch-icon-precomposed"]')
    .map((l) => ({ href: l.getAttribute("href") ?? "", rel: l.getAttribute("rel") ?? "", size: Number((l.getAttribute("sizes") ?? "").split("x")[0]) || 0 }))
    .filter((i) => i.href)
    .sort((a, b) => Number(b.rel.includes("apple")) - Number(a.rel.includes("apple")) || b.size - a.size);
  let logo: string | null = null;
  for (const icon of icons.slice(0, 3)) {
    try {
      const img = await get(new URL(icon.href, page.url).toString(), MAX_LOGO, "image/*");
      const type = img.type.split(";")[0].trim();
      if (/^image\/(png|jpeg|webp|svg\+xml|gif)$/.test(type) && img.body.length > 0 && img.body.length < MAX_LOGO) {
        logo = `data:${type};base64,${img.body.toString("base64")}`;
        break;
      }
    } catch {
      // An icon that will not load costs the video its logo, nothing more.
    }
  }

  return {
    url: page.url.toString(),
    domain,
    name: name.slice(0, 40),
    title: title.slice(0, 160),
    description: (meta('meta[name="description"]') || meta('meta[property="og:description"]')).slice(0, 300),
    lang: clean(doc.querySelector("html")?.getAttribute("lang")).slice(0, 12),
    headings: headings.slice(0, 20),
    paragraphs: paragraphs.slice(0, 30),
    ctas: ctas.slice(0, 12),
    accent: normalizeHex(meta('meta[name="theme-color"]')),
    logo,
    text,
    images,
  };
}
