import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

/**
 * In the desktop app the studio's server listens on a loopback port that
 * any program on the machine, or a web page through DNS rebinding, could
 * reach. The desktop shell starts it with a secret for this launch and adds
 * it to every request it forwards; anything without it, or addressed to
 * another host, is refused. On the web (no secret set) this does nothing.
 */
export function proxy(req: NextRequest) {
  const secret = process.env.ONEMOTION_DESKTOP_SECRET;
  if (!secret) return NextResponse.next();
  const given = req.headers.get("x-onemotion-desktop") ?? "";
  const host = req.headers.get("host") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  const ok = a.length === b.length && timingSafeEqual(a, b) && host === `127.0.0.1:${process.env.PORT}`;
  return ok ? NextResponse.next() : new NextResponse("Forbidden", { status: 403 });
}
