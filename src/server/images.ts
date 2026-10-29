import "server-only";
import { Agent, FormData, fetch as pinnedFetch } from "undici";
import { OneAPIError } from "./oneapi";
import { get, SiteError, vet } from "./site";

/**
 * Image generation for bespoke films, on the person's own image endpoint
 * (an OpenAI-compatible /images/generations and /images/edits, e.g.
 * NaraRouter's api-images.bynara.id/v1). The base URL is one the person
 * typed, so it is vetted like a custom chat endpoint: http(s), a public
 * address (a local server too on the desktop app), the connection pinned to
 * the address that was checked, no redirects.
 */

export type ImageRequest = {
  base: string;
  key: string;
  model: string;
  prompt: string;
  negative?: string;
  size: string;
  quality: string;
  /** An image to edit (a data URL): sent to /images/edits instead of /images/generations. */
  image?: { type: string; body: Buffer };
  signal: AbortSignal;
};

/** The largest image an endpoint may send back (a 2048 px PNG is a few MB). */
const MAX_IMAGE = 12_000_000;

const desktop = () => Boolean(process.env.ONEMOTION_DESKTOP_SECRET);

const said = (text: string): string | undefined => {
  try {
    const j = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    return typeof j.error === "string" ? j.error : (j.error?.message ?? j.message);
  } catch {
    return text.slice(0, 200) || undefined;
  }
};

function failure(host: string, status: number, text: string): OneAPIError {
  const why = said(text);
  if (status === 401 || status === 403) return new OneAPIError(401, `${host} did not accept the image key${why ? ` (${why})` : ""}. Check it in Settings.`);
  if (status === 402) return new OneAPIError(402, `${host}: the balance does not cover this image${why ? ` (${why})` : ""}.`);
  if (status === 429) return new OneAPIError(429, `${host} is rate limiting image requests. Wait a moment and try again.`);
  if (status >= 300 && status < 400) return new OneAPIError(502, `${host} answered with a redirect; use the final base URL in Settings.`);
  return new OneAPIError(status, `${host} answered ${status}${why ? `: ${why}` : "."}`);
}

/** One generated (or edited) image, as a data URL. */
export async function makeImage(r: ImageRequest): Promise<{ data: string; type: string }> {
  let url: URL;
  try {
    url = new URL(`${r.base.replace(/\/+$/, "")}/images/${r.image ? "edits" : "generations"}`);
  } catch {
    throw new OneAPIError(400, "The image endpoint's base URL is not a valid address.");
  }
  const host = url.host;
  let addr: { address: string; family: number };
  try {
    addr = await vet(url, { api: true, allowPrivate: desktop() });
  } catch (err) {
    throw new OneAPIError(400, err instanceof SiteError ? `${host}: ${err.message}` : `${host} could not be reached.`);
  }
  const dispatcher = new Agent({ connect: { lookup: (_h, _o, cb) => cb(null, [{ address: addr.address, family: addr.family }] as never) } });
  let body: string | FormData;
  const headers: Record<string, string> = { Authorization: `Bearer ${r.key}`, Accept: "application/json", "User-Agent": "onemotion/0.2" };
  if (r.image) {
    const form = new FormData();
    form.append("image", new Blob([new Uint8Array(r.image.body)], { type: r.image.type }), `image.${r.image.type.split("/")[1] ?? "png"}`);
    form.append("model", r.model);
    form.append("prompt", r.prompt);
    form.append("size", r.size);
    form.append("quality", r.quality);
    form.append("response_format", "b64_json");
    body = form;
  } else {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify({ model: r.model, prompt: r.prompt, ...(r.negative ? { negative_prompt: r.negative } : {}), n: 1, size: r.size, quality: r.quality, response_format: "b64_json" });
  }
  try {
    const res = await pinnedFetch(url, { method: "POST", headers, body, redirect: "manual", signal: r.signal, dispatcher });
    const text = await res.text();
    if (!res.ok) throw failure(host, res.status, text);
    let first: { b64_json?: string; url?: string } | undefined;
    try {
      first = (JSON.parse(text) as { data?: { b64_json?: string; url?: string }[] }).data?.[0];
    } catch {
      throw new OneAPIError(502, `${host} sent an answer that is not JSON.`);
    }
    if (first?.b64_json) {
      const type = sniff(first.b64_json);
      return { data: `data:${type};base64,${first.b64_json}`, type };
    }
    // Some endpoints answer with an address even when asked for base64: fetched like any public image.
    if (first?.url) {
      const img = await get(first.url, MAX_IMAGE, "image/*");
      const type = img.type.split(";")[0].trim().toLowerCase() || "image/png";
      return { data: `data:${type};base64,${img.body.toString("base64")}`, type };
    }
    throw new OneAPIError(502, `${host} answered without an image${said(text) ? ` (${said(text)})` : ""}.`);
  } catch (err) {
    if (err instanceof OneAPIError || err instanceof SiteError) throw err;
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) throw err;
    throw new OneAPIError(502, `${host} could not be reached (${err instanceof Error ? err.message : String(err)}).`);
  } finally {
    void dispatcher.close();
  }
}

/** The image type from base64's first bytes: PNG, JPEG or WebP (PNG when unsure). */
export function sniff(b64: string): string {
  if (b64.startsWith("/9j/")) return "image/jpeg";
  if (b64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}
