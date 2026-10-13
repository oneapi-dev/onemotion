import { readExample } from "@/bespoke/examples";

/** A hand-written example film, for the bespoke lab and as a reference scene. */
export async function GET(req: Request) {
  const name = new URL(req.url).searchParams.get("name") ?? "gateway";
  const ex = readExample(name);
  if (!ex) return Response.json({ error: `No example "${name}".` }, { status: 404 });
  return Response.json(ex);
}
