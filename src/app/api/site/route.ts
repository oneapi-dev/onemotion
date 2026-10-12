import { readSite, SiteError } from "@/server/site";

export const maxDuration = 30;

/** Reads a website a brief names: name, copy, brand color, logo. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { url?: unknown } | null;
  const url = typeof body?.url === "string" ? body.url : "";
  try {
    return Response.json({ site: await readSite(url) });
  } catch (err) {
    if (err instanceof SiteError) return Response.json({ error: err.message }, { status: 422 });
    console.error("read site failed", err);
    return Response.json({ error: "That website could not be opened. Check the address and try again." }, { status: 422 });
  }
}
