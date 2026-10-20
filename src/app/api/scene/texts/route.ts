import { sceneColors, screenTexts } from "@/bespoke/screenText";

export const runtime = "nodejs";

/**
 * The words a scene puts on screen, with where each sits in its source, and
 * the colours it uses, for editing them by hand. Stateless; holds nothing.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { files?: unknown } | null;
  const files = body?.files;
  if (!files || typeof files !== "object" || Array.isArray(files) || Object.values(files).some((v) => typeof v !== "string")) {
    return Response.json({ error: "Send { files: { path: source } }." }, { status: 400 });
  }
  try {
    const scene = files as Record<string, string>;
    return Response.json({ texts: screenTexts(scene), ...sceneColors(scene) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : String(err) }, { status: 422 });
  }
}
