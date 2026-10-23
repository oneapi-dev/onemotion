"use client";

import { chatStep, jsonStep, SchemaError } from "@/bespoke/agent/llm";
import type { SiteInfo } from "@/director/input";
import { findUrl } from "@/director/facts";
import { cleanBrief, normalizeReview, partnerSite, reviewPrompt, siteOf, writerPrompt, type BriefIdea, type BriefReview, type SiteText } from "./briefs";

/** The website's own words, for the brief writer; null when it cannot be read. */
async function readSite(website: string, signal?: AbortSignal): Promise<SiteText | null> {
  if (!siteOf(website)) return null;
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
 * the wizard when the person has not written one. One call on their key.
 */
export async function writeBrief(o: { key: string; model: string; idea: BriefIdea; format: string; signal?: AbortSignal }): Promise<{ brief: string; website: string }> {
  const website = o.idea.website.trim() || findUrl(o.idea.idea) || "";
  const partner = partnerSite(o.idea);
  const [site, partnerPage] = await Promise.all([readSite(website, o.signal), partner ? readSite(partner, o.signal) : null]);
  const p = writerPrompt({ ...o.idea, website }, site, o.format, partnerPage);
  const r = await chatStep({
    key: o.key,
    model: o.model,
    messages: [
      { role: "system", content: p.system },
      { role: "user", content: p.user },
    ],
    maxTokens: 6000,
    signal: o.signal,
  });
  const brief = cleanBrief(r.text);
  if (brief.length < 200) throw new Error("The model's brief came back empty or too short. Try again, or pick another model.");
  return { brief, website };
}

/**
 * "Improve with AI" on a brief the person wrote: their model reads it
 * against the website and answers what is missing, what only the person can
 * say, and what contradicts itself. The brief is never rewritten: additions
 * go below it (briefs.applyReview). One call on their key.
 */
export async function reviewBrief(o: { key: string; model: string; brief: string; website: string; signal?: AbortSignal }): Promise<{ review: BriefReview; website: string }> {
  const website = o.website.trim() || findUrl(o.brief) || "";
  const site = await readSite(website, o.signal);
  const p = reviewPrompt(o.brief, site, siteOf(website));
  const { value } = await jsonStep(
    {
      key: o.key,
      model: o.model,
      messages: [
        { role: "system", content: p.system },
        { role: "user", content: p.user },
      ],
      maxTokens: 3000,
      signal: o.signal,
    },
    (raw) => {
      const r = normalizeReview(raw);
      if (!r.review) throw new SchemaError(r.problems);
      return r.review;
    },
  );
  return { review: value, website };
}
