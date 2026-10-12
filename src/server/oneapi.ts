import "server-only";
import type { CatalogModel } from "@/director/input";

/**
 * Everything this app asks of OneAPI: the director's chat completions, sent
 * with the person's own OneAPI key, and the public model catalog that gives
 * a brief naming a model its real prices.
 */

export const BASE_URL = (process.env.ONEAPI_BASE_URL ?? "https://api.oneapi.id/v1").replace(/\/+$/, "");
const CATALOG_URL = process.env.ONEAPI_CATALOG_URL ?? "https://oneapi.id/api/public/models";

/** OneAPI's own words when a call fails, for the person to read. */
export class OneAPIError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "OneAPIError";
  }
}

type Listing = {
  public_model: string;
  display_name?: string;
  tagline?: string;
  context_window?: string;
  capabilities?: string[] | null;
  price_input_per_1m?: string;
  price_output_per_1m?: string;
  list_price_input_per_1m?: string | null;
  list_price_output_per_1m?: string | null;
  currency?: string;
  free_enabled?: boolean;
};

let cache: { at: number; models: CatalogModel[] } | null = null;
const CATALOG_TTL = 10 * 60 * 1000;

/** The public catalog, cached for ten minutes. An outage costs only facts. */
export async function catalog(): Promise<CatalogModel[]> {
  if (cache && Date.now() - cache.at < CATALOG_TTL) return cache.models;
  try {
    const res = await fetch(CATALOG_URL, { signal: AbortSignal.timeout(8000), headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error(`catalog ${res.status}`);
    const body = (await res.json()) as { models?: Listing[] };
    const models = (body.models ?? []).map(
      (l): CatalogModel => ({
        id: l.public_model,
        name: l.display_name ?? "",
        tagline: l.tagline ?? "",
        contextWindow: l.context_window ?? "",
        capabilities: l.capabilities ?? [],
        inputPrice: l.price_input_per_1m ?? "",
        outputPrice: l.price_output_per_1m ?? "",
        listInput: l.list_price_input_per_1m ?? "",
        listOutput: l.list_price_output_per_1m ?? "",
        currency: l.currency ?? "USD",
        free: Boolean(l.free_enabled),
      }),
    );
    cache = { at: Date.now(), models };
    return models;
  } catch (err) {
    console.warn("OneAPI catalog unavailable:", err);
    return cache?.models ?? [];
  }
}

/** One non-streaming chat completion with the person's key. */
export async function chat(key: string, body: unknown, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json", "User-Agent": "oneapi-motion/0.1" },
    body: JSON.stringify(body),
    signal,
  });
  const text = await res.text();
  let parsed: { error?: { message?: string } } | null = null;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = null;
  }
  if (!res.ok) {
    const said = parsed?.error?.message;
    const message =
      res.status === 401
        ? "OneAPI did not accept this API key. Check it in Settings, or create one at oneapi.id."
        : res.status === 402
          ? "Your OneAPI balance is too low for this model. Top up at oneapi.id, or pick a cheaper model."
          : res.status === 429
            ? "OneAPI is rate limiting this key. Wait a moment and try again."
            : `OneAPI answered ${res.status}${said ? `: ${said}` : "."}`;
    throw new OneAPIError(res.status, message);
  }
  if (!parsed) throw new OneAPIError(502, "OneAPI sent an answer that was not JSON.");
  return parsed;
}
