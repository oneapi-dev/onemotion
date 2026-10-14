import { get, normalizeAddress, SiteError } from "@/server/site";

export const maxDuration = 30;

/** The largest image an agent may bring into a film. Logos and icons are far smaller. */
const MAX_IMAGE = 1_500_000;
const TYPES = /^image\/(png|jpeg|webp|gif|svg\+xml|x-icon|vnd\.microsoft\.icon|avif)$/;

/**
 * Fetches one public image for a bespoke film (a real logo, a product
 * icon) and returns it as a data URL. Most sites send their images
 * without CORS, which would leave them out of the MP4 export; brought in
 * as data, they always export. Every hop is vetted like a website read:
 * public addresses only, pinned, size-capped.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const raw = typeof body?.url === "string" ? body.url : "";
  try {
    const img = await get(normalizeAddress(raw), MAX_IMAGE, "image/avif,image/webp,image/svg+xml,image/png,image/*;q=0.8");
    const type = img.type.split(";")[0].trim().toLowerCase();
    if (!TYPES.test(type)) return Response.json({ error: `That address is not an image (it is ${type || "unknown"}).` }, { status: 422 });
    if (!img.body.length) return Response.json({ error: "That image is empty." }, { status: 422 });
    return Response.json({ url: img.url.toString(), type, bytes: img.body.length, data: `data:${type};base64,${img.body.toString("base64")}` });
  } catch (err) {
    if (err instanceof SiteError) return Response.json({ error: err.message }, { status: 422 });
    console.error("fetch asset failed", err);
    return Response.json({ error: "That image could not be fetched." }, { status: 422 });
  }
}
