"use client";

import { jsonStep } from "@/bespoke/agent/llm";
import type { SiteInfo } from "@/director/input";
import { readSuggestion, siteOf, suggestPrompt, type BriefAnswers, type Suggestion } from "./briefs";

/**
 * The wizard's "write it with AI": reads the website, then asks the
 * person's model (on their own key) for the message of the brief, from the
 * site's own words. One small call.
 */
export async function suggestBrief(o: { key: string; model: string; answers: BriefAnswers; signal?: AbortSignal }): Promise<Suggestion> {
  const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: siteOf(o.answers.website) }), signal: o.signal });
  const body = (await res.json().catch(() => null)) as { site?: SiteInfo; error?: string } | null;
  if (!res.ok || !body?.site) throw new Error(body?.error ?? "The website could not be read.");
  const site = body.site;
  const text = site.text || [...site.headings, ...site.paragraphs].join("\n");
  const p = suggestPrompt(o.answers, { url: site.url, title: site.title, description: site.description, text });
  const r = await jsonStep({
    key: o.key,
    model: o.model,
    messages: [
      { role: "system", content: p.system },
      { role: "user", content: p.user },
    ],
    temperature: 0.5,
    maxTokens: 4000,
    signal: o.signal,
  });
  return readSuggestion(r.value);
}
