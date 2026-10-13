import { agentPrompt, conceptPrompt, reviewPrompt } from "@/bespoke/agent/prompts";

/** The bespoke prompts, built here because they include the kit's source and the example scene. */
export async function GET() {
  return Response.json({ concept: conceptPrompt(), agent: agentPrompt(), review: reviewPrompt() }, { headers: { "Cache-Control": "no-store" } });
}
