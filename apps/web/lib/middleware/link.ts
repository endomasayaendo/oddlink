import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { recordClick } from "@/lib/links/record-click";
import { resolveShortCode, toRedirectUrl } from "@/lib/links/resolve-link";

export async function LinkMiddleware(req: NextRequest, ev: Pick<NextFetchEvent, "waitUntil">, key: string) {
  const link = await resolveShortCode(key);
  const target = link && toRedirectUrl(link.originalUrl);

  if (!link || !target) {
    return NextResponse.redirect(new URL("/not-found", req.url), 302);
  }

  // Log after the response is sent so the redirect isn't slowed down.
  ev.waitUntil(recordClick(link.id).catch((error) => console.error("Failed to record access", error)));
  return NextResponse.redirect(target, 302);
}
