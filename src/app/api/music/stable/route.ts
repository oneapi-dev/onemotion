export const maxDuration = 300;

const API = "https://api.stableaudio.com/v1alpha/generations";
/** The model stableaudio.com's own app generates with. */
const MODEL = "stable-audio-v3";
/** How long the generation is waited for, and how often it is asked about. */
const WAIT_MS = 240_000;
const POLL_MS = 3_000;

/**
 * Stable Audio music for a film, made with the person's own stableaudio.com login token (the web
 * app's API: not an official, documented one; it spends that account's credits). The browser
 * cannot call it (no CORS for this origin), so this route does: it starts the generation, waits
 * for the result and hands back the MP3. The token is used for this request only, never stored.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { token?: unknown; prompt?: unknown; seconds?: unknown } | null;
  const token = typeof body?.token === "string" ? body.token.trim().replace(/^Bearer\s+/i, "") : "";
  const prompt = typeof body?.prompt === "string" ? body.prompt.trim().slice(0, 2000) : "";
  const seconds = typeof body?.seconds === "number" && Number.isFinite(body.seconds) ? Math.round(Math.min(360, Math.max(3, body.seconds))) : 0;
  if (!token || !prompt || !seconds) return Response.json({ error: "A Stable Audio token, a prompt and a length are needed." }, { status: 400 });
  const auth = { Authorization: `Bearer ${token}` };

  const start = await fetch(`${API}/${MODEL}/text-to-music`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ data: { type: "generations", attributes: { prompts: [{ text: prompt, weight: 1 }], length_seconds: seconds, seed: -1 } } }),
    signal: req.signal,
  });
  if (!start.ok) return failure(start);
  const made = (await start.json().catch(() => null)) as { data?: { links?: { result?: string } }[] } | null;
  const result = made?.data?.[0]?.links?.result;
  if (!result || !result.startsWith(API)) return Response.json({ error: "Stable Audio started no generation." }, { status: 502 });

  for (const until = Date.now() + WAIT_MS; Date.now() < until; ) {
    const r = await fetch(result, { headers: auth, signal: req.signal });
    if (r.status === 200) return new Response(await r.arrayBuffer(), { headers: { "Content-Type": r.headers.get("content-type") ?? "audio/mpeg" } });
    if (r.status !== 202) return failure(r);
    await new Promise((d) => setTimeout(d, POLL_MS));
  }
  return Response.json({ error: "Stable Audio did not finish the track in time." }, { status: 504 });
}

async function failure(r: Response): Promise<Response> {
  const text = (await r.text().catch(() => "")).slice(0, 300);
  const why =
    r.status === 401 || r.status === 403
      ? "the Stable Audio token is expired or wrong: log in at stableaudio.com and copy a fresh one"
      : r.status === 402 || /credit/i.test(text)
        ? "the stableaudio.com account is out of credits"
        : `Stable Audio answered ${r.status}${text ? `: ${text}` : ""}`;
  return Response.json({ error: why }, { status: r.status === 401 || r.status === 403 || r.status === 402 ? r.status : 502 });
}
