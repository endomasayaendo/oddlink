import { type NextRequest, NextResponse } from "next/server";
import { getLinkState } from "@/lib/links/link-state";
import { isPossibleShortCode } from "@/lib/middleware/utils/is-possible-short-code";
import { isReservedKey } from "@/lib/middleware/utils/is-reserved-key";
import { serveGone } from "@/lib/middleware/utils/serve-gone";
import { rewriteNotFound } from "@/lib/middleware/utils/rewrite-not-found";

/**
 * Answers unknown codes with a real 404 and deleted ones with the 410 gone page before the page
 * renders. A disabled link keeps its analytics page, which explains the state. The analytics page
 * streams behind a prerendered shell, so a notFound() there can only keep the 200.
 * `shortCode` is `""` when the path segment couldn't be decoded.
 */
export async function AnalyticsMiddleware(req: NextRequest, shortCode: string) {
  // Anything that can't be a code (empty, too long, control characters, `.`) skips the lookup.
  if (!isPossibleShortCode(shortCode) || isReservedKey(shortCode)) {
    return notFound(req);
  }

  try {
    const status = await getLinkState(shortCode);
    if (!status) return notFound(req);
    // A tombstone has no data left to show.
    if (status.state === "deleted") return serveGone(status);
  } catch (error) {
    // Let the page do its own lookup, so a DB outage reaches its error handling
    // instead of failing here with a bare 500.
    console.error("Failed to check analytics short code", error);
  }
  return NextResponse.next();
}

function notFound(req: NextRequest) {
  return rewriteNotFound(req, "/analytics/not-found");
}
