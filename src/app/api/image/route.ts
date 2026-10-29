import { makeImage } from "@/server/images";
import { OneAPIError } from "@/server/oneapi";
import { SiteError } from "@/server/site";

export const maxDuration = 200;

const MAX_PROMPT = 4000;
const SIZE = /^(auto|\d{3,4}x\d{3,4})$/;
const QUALITY = /^(auto|low|medium|high|standard|hd)$/;
/** The largest image sent to be edited (a data URL's bytes). */
const MAX_EDIT = 8_000_000;

/**
 * One image for a bespoke film: generated from a prompt, or an existing
 * image edited, on the person's image endpoint with their key from
 * X-Image-Key (never stored). The agent calls it as a tool, so a failure
 * comes back as an answer it reads.
 */
export async function POST(req: Request) {
  const key = req.headers.get("x-image-key")?.trim() ?? "";
  if (!key) return Response.json({ error: "Add the image endpoint's key in Settings first." }, { status: 401 });
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const text = (k: string) => (typeof b?.[k] === "string" ? (b[k] as string).trim() : "");
  const base = text("base");
  const model = text("model");
  const prompt = text("prompt");
  const size = text("size") || "1024x1024";
  const quality = text("quality") || "medium";
  if (!/^https?:\/\//i.test(base)) return Response.json({ error: "Set the image endpoint's base URL in Settings." }, { status: 400 });
  if (!model) return Response.json({ error: "Set the image model in Settings." }, { status: 400 });
  if (!prompt) return Response.json({ error: "Send a prompt." }, { status: 400 });
  if (prompt.length > MAX_PROMPT) return Response.json({ error: `Keep the prompt under ${MAX_PROMPT} characters.` }, { status: 400 });
  if (!SIZE.test(size) || !QUALITY.test(quality)) return Response.json({ error: "Unknown size or quality." }, { status: 400 });
  let image: { type: string; body: Buffer } | undefined;
  const from = text("image");
  if (from) {
    const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(from);
    if (!m) return Response.json({ error: "The image to edit must be a PNG, JPEG or WebP data URL." }, { status: 400 });
    if (m[2].length > MAX_EDIT) return Response.json({ error: "The image to edit is too large." }, { status: 400 });
    image = { type: m[1], body: Buffer.from(m[2], "base64") };
  }
  try {
    const out = await makeImage({ base, key, model, prompt, negative: text("negative") || undefined, size, quality, image, signal: AbortSignal.any([AbortSignal.timeout(190_000), req.signal]) });
    return Response.json(out);
  } catch (err) {
    if (err instanceof OneAPIError) return Response.json({ error: err.message }, { status: err.status >= 400 && err.status < 600 ? err.status : 502 });
    if (err instanceof SiteError) return Response.json({ error: err.message }, { status: 422 });
    if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return Response.json({ error: "The image took too long to make." }, { status: 504 });
    console.error("image failed", err);
    return Response.json({ error: "The image could not be made." }, { status: 502 });
  }
}
