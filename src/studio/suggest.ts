"use client";

import { chatStep } from "@/bespoke/agent/llm";
import type { SiteInfo } from "@/director/input";
import { findUrl } from "@/director/facts";
import { cleanBrief, siteOf, writerPrompt, type BriefIdea, type SiteText } from "./briefs";

/** The website's own words, for the brief writer; null when it cannot be read. */
async function readSite(website: string, signal?: AbortSignal): Promise<SiteText | null> {
  try {
    const res = await fetch("/api/site", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: siteOf(website) }), signal });
    const body = (await res.json().catch(() => null)) as { site?: SiteInfo } | null;
    if (!res.ok || !body?.site) return null;
    const s = body.site;
    return { url: s.url, title: s.title, description: s.description, text: s.text || [...s.headings, ...s.paragraphs].join("\n") };
  } catch (err) {
    if (signal?.aborted) throw err;
    return null;
  }
}

/**
 * The person's model writes a full creative brief from their idea (a line,
 * an offer, or a whole rough brief) and the website's own words. Used by
 * the wizard and by "Improve with AI". One call on their key.
 */
export async function writeBrief(o: { key: string; model: string; idea: BriefIdea; format: string; signal?: AbortSignal }): Promise<{ brief: string; website: string }> {
  const website = o.idea.website.trim() || findUrl(o.idea.idea) || "";
  const site = await readSite(website, o.signal);
  const p = writerPrompt({ ...o.idea, website }, site, o.format);
  const r = await chatStep({
    key: o.key,
    model: o.model,
    messages: [
      { role: "system", content: p.system },
      { role: "user", content: p.user },
    ],
    temperature: 0.7,
    maxTokens: 6000,
    signal: o.signal,
  });
  const brief = cleanBrief(r.text);
  if (brief.length < 200) throw new Error("The model's brief came back empty or too short. Try again, or pick another model.");
  return { brief, website };
}
