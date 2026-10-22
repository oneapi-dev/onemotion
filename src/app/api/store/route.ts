import { dataRoot, listProjects, readSettings, removeProject, storeAllowed, validId, writeProject, writeSettings, type Doc } from "@/server/dataDir";

export const dynamic = "force-dynamic";

const refused = () => new Response("Forbidden", { status: 403 });

/** Everything the studio keeps on this computer: its projects, its settings and the folder they live in. */
export async function GET(req: Request) {
  if (!storeAllowed(req)) return refused();
  const [root, { projects, skipped }, settings] = await Promise.all([dataRoot(), listProjects(), readSettings()]);
  return Response.json({ root, projects, skipped, settings }, { headers: { "Cache-Control": "no-store" } });
}

/** Saves what changed: projects to write, ids to remove, and the settings. */
export async function PUT(req: Request) {
  if (!storeAllowed(req)) return refused();
  let body: { upsert?: unknown; remove?: unknown; settings?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Not JSON." }, { status: 400 });
  }
  const upsert = Array.isArray(body.upsert) ? (body.upsert as Doc[]) : [];
  const remove = Array.isArray(body.remove) ? body.remove : [];
  if (upsert.some((d) => !d || typeof d !== "object" || !validId(d.id)) || remove.some((id) => !validId(id))) return Response.json({ error: "A project needs an id of letters, digits, - and _." }, { status: 400 });
  if (body.settings !== undefined && (body.settings === null || typeof body.settings !== "object" || Array.isArray(body.settings))) return Response.json({ error: "Settings must be an object." }, { status: 400 });
  try {
    for (const d of upsert) await writeProject(d);
    for (const id of remove as string[]) await removeProject(id);
    if (body.settings) await writeSettings(body.settings as Record<string, unknown>);
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : "Could not save." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
