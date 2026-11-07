import { type NextRequest, NextResponse } from "next/server";
import { type ResolvedLink, resolveShortCode, toRedirectUrl } from "@/lib/links/resolve-link";

export async function LinkMiddleware(req: NextRequest, key: string) {
  let link: ResolvedLink | null;
  try {
    link = await resolveShortCode(key);
  } catch (error) {
    // Counting and logging are one statement, so a failed write means no redirect either.
    console.error("Failed to resolve short link", error);
    return new NextResponse(null, { status: 503 });
  }
  const target = link && toRedirectUrl(link.originalUrl);

  if (!link || !target) {
    // Safe behind a proxy: Next's middleware adapter rewrites a same-host redirect into a
    // relative `Location: /not-found`, so the internal host in req.url never reaches the browser.
    // Don't return a literal relative Location instead; the adapter parses it without a base and throws.
    return NextResponse.redirect(new URL("/not-found", req.url), 302);
  }

  return NextResponse.redirect(target, 302);
}
