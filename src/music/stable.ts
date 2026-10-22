/** A Stable Audio music bed, through this app's server (src/app/api/music/stable): the person's stableaudio.com token, their credits. */
export async function stableMusic(token: string, prompt: string, seconds: number, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch("/api/music/stable", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, prompt, seconds }), signal });
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(j?.error ?? `Stable Audio failed (${res.status})`);
  }
  return res.blob();
}

/** How long a Stable Audio login token (a JWT) has left, read from its own expiry. */
export function tokenLeft(token: string | undefined, now = Date.now()): string {
  try {
    const part = (token ?? "").split(".")[1] ?? "";
    const exp = Number(JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))).exp);
    if (!Number.isFinite(exp)) return "Token without an expiry";
    const min = Math.round((exp * 1000 - now) / 60_000);
    if (min <= 0) return "expired";
    return min >= 60 ? `Valid for about ${Math.floor(min / 60)} h ${min % 60} min` : `Valid for about ${min} min`;
  } catch {
    return "Not a Stable Audio token";
  }
}
