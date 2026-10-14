import { checkScene } from "@/bespoke/check";

export const runtime = "nodejs";

/**
 * Checks a bespoke scene and compiles it for the page: the files in, the
 * problems or the compiled modules out. Stateless; holds nothing.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { files?: unknown; facts?: unknown } | null;
  const files = body?.files;
  if (!files || typeof files !== "object" || Array.isArray(files) || Object.values(files).some((v) => typeof v !== "string")) {
    return Response.json({ error: "Send { files: { path: source } }." }, { status: 400 });
  }
  return Response.json(checkScene(files as Record<string, string>, typeof body?.facts === "string" ? body.facts : undefined));
}
