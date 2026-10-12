import { catalog } from "@/server/oneapi";

/** OneAPI's public models: the model picker and the facts briefs can quote. */
export async function GET() {
  const models = await catalog();
  return Response.json({ models }, { headers: { "Cache-Control": "public, max-age=300" } });
}
