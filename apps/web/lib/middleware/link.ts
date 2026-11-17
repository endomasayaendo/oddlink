import { type NextRequest, NextResponse } from "next/server";
import { getLinkState, type LinkStatus } from "@/lib/links/link-state";
import { findActiveLink, type ResolvedLink, resolveShortCode, toRedirectUrl } from "@/lib/links/resolve-link";
import { isCountableClick } from "@/lib/middleware/utils/is-countable-click";
import { isPossibleShortCode } from "@/lib/middleware/utils/is-possible-short-code";
import { serveGone } from "@/lib/middleware/utils/serve-gone";
import { rewriteNotFound } from "@/lib/middleware/utils/rewrite-not-found";

export async function LinkMiddleware(req: NextRequest, key: string) {
  // Keys that can't be a short code never reach the DB (a NUL there would even fail the query).
  if (!isPossibleShortCode(key)) return notFound(req);

  // HEAD (link checkers, monitors), prefetches and known bots are not people clicking: they get
  // the same answer, uncounted.
  const counted = req.method === "GET" && isCountableClick(req);
  const lookup = counted ? resolveShortCode : findActiveLink;
  let link: ResolvedLink | null;
  try {
    link = await lookup(key);
  } catch (error) {
    // No redirect without a successful lookup; for a counted GET that includes the count-and-log write.
    console.error("Failed to resolve short link", error);
    return unavailable();
  }
  const target = link && toRedirectUrl(link.originalUrl);
  if (link && target) return NextResponse.redirect(target, 302);

  // Only a miss pays for a second, read-only lookup, and only to choose the response.
  let status: LinkStatus | null;
  try {
    status = await getLinkState(key);
  } catch (error) {
    console.error("Failed to look up short link state", error);
    return unavailable();
  }
  // Unknown, expired, and active with a URL no redirect may follow: all the plain 404.
  if (status?.state === "disabled" || status?.state === "deleted") return serveGone(status);
  return notFound(req);
}

function unavailable() {
  return new NextResponse(null, { status: 503 });
}

// Unknown and expired codes both get a real 404 from the static page, under the requested URL.
function notFound(req: NextRequest) {
  return rewriteNotFound(req, "/not-found");
}
