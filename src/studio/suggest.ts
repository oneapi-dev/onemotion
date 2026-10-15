"use client";

import { jsonStep } from "@/bespoke/agent/llm";
import type { SiteInfo } from "@/director/input";
import { findUrl } from "@/director/facts";
import { buildBrief, improvePrompt, readImproved, readSuggestion, siteOf, suggestPrompt, type BriefAnswers, type Suggestion } from "./briefs";

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

/**
 * "Improve with AI" on the brief box: the person's model sorts their rough
 * brief into the wizard's fields (with the website's own words where the
 * brief is silent), and the brief is rebuilt from them, so every brief has
 * the same shape and the same rules of fact. One small call.
 */
export async function improveBrief(o: { key: string; model: string; brief: string; website: string; signal?: AbortSignal }): Promise<{ brief: string; website: string }> {
  const website = o.website.trim() || findUrl(o.brief) || "";
  let site: { url: string; title: string; description: string; text: string } | null = null;
  try {
    const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: siteOf(website) }), signal: o.signal });
    const body = (await res.json().catch(() => null)) as { site?: SiteInfo } | null;
    if (res.ok && body?.site) site = { url: body.site.url, title: body.site.title, description: body.site.description, text: body.site.text || [...body.site.headings, ...body.site.paragraphs].join("\n") };
  } catch (err) {
    if (o.signal?.aborted) throw err;
    // An unreadable website still leaves the brief to improve.
  }
  const p = improvePrompt(o.brief, site);
  const r = await jsonStep({
    key: o.key,
    model: o.model,
    messages: [
      { role: "system", content: p.system },
      { role: "user", content: p.user },
    ],
    temperature: 0.3,
    maxTokens: 4000,
    signal: o.signal,
  });
  const answers = readImproved(r.value, website);
  return { brief: buildBrief(answers), website };
}
