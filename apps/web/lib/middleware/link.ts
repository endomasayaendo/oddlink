import { type NextRequest, NextResponse } from "next/server";
import { type ResolvedLink, resolveShortCode, toRedirectUrl } from "@/lib/links/resolve-link";
import { isPossibleShortCode } from "@/lib/middleware/utils/is-possible-short-code";
import { rewriteNotFound } from "@/lib/middleware/utils/rewrite-not-found";

export async function LinkMiddleware(req: NextRequest, key: string) {
  // Keys that can't be a short code never reach the DB (a NUL there would even fail the query).
  if (!isPossibleShortCode(key)) return notFound(req);

  let link: ResolvedLink | null;
  try {
    link = await resolveShortCode(key);
  } catch (error) {
    // Counting and logging are one statement, so a failed write means no redirect either.
    console.error("Failed to resolve short link", error);
    return new NextResponse(null, { status: 503 });
  }
  const target = link && toRedirectUrl(link.originalUrl);

  if (!link || !target) return notFound(req);

  return NextResponse.redirect(target, 302);
}

// Unknown and expired codes both get a real 404 from the static page, under the requested URL.
function notFound(req: NextRequest) {
  return rewriteNotFound(req, "/not-found");
}
