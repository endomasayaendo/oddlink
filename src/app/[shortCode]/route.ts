import { after, NextResponse } from "next/server";
import { recordAccess, resolveShortCode, toRedirectUrl } from "@/lib/redirect";

export async function GET(request: Request, { params }: RouteContext<"/[shortCode]">) {
  const { shortCode } = await params;
  const link = await resolveShortCode(shortCode);
  const target = link && toRedirectUrl(link.originalUrl);

  if (!link || !target) {
    return NextResponse.redirect(new URL("/not-found", request.url), 302);
  }

  // Log after the response is sent so the redirect isn't slowed down.
  after(() => recordAccess(link.id).catch((error) => console.error("Failed to record access", error)));
  return NextResponse.redirect(target, 302);
}
