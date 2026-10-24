import { after, NextResponse } from "next/server";
import { recordClick } from "@/lib/links/record-click";
import { resolveShortCode, toRedirectUrl } from "@/lib/links/resolve-link";

export async function GET(request: Request, { params }: RouteContext<"/[shortCode]">) {
  const { shortCode } = await params;
  const link = await resolveShortCode(shortCode);
  const target = link && toRedirectUrl(link.originalUrl);

  if (!link || !target) {
    return NextResponse.redirect(new URL("/not-found", request.url), 302);
  }

  // Log after the response is sent so the redirect isn't slowed down.
  after(() => recordClick(link.id).catch((error) => console.error("Failed to record access", error)));
  return NextResponse.redirect(target, 302);
}
