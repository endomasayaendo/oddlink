import { type NextRequest, NextResponse } from "next/server";
import { resolveShortCode, toRedirectUrl } from "@/lib/links/resolve-link";

export async function LinkMiddleware(req: NextRequest, key: string) {
  const link = await resolveShortCode(key);
  const target = link && toRedirectUrl(link.originalUrl);

  if (!link || !target) {
    return NextResponse.redirect(new URL("/not-found", req.url), 302);
  }

  return NextResponse.redirect(target, 302);
}
