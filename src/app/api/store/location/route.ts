import { changeRoot, storeAllowed } from "@/server/dataDir";

export const dynamic = "force-dynamic";

/** Moves the studio to another data folder, copying the projects when asked. */
export async function POST(req: Request) {
  if (!storeAllowed(req)) return new Response("Forbidden", { status: 403 });
  let body: { dir?: unknown; copy?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Not JSON." }, { status: 400 });
  }
  if (typeof body.dir !== "string") return Response.json({ error: "Give a folder path." }, { status: 400 });
  try {
    return Response.json(await changeRoot(body.dir, body.copy === true));
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not use that folder." }, { status: 400 });
  }
}
