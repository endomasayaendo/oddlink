import { type NextRequest, NextResponse } from "next/server";
import { shortCodeExists } from "@/lib/analytics/short-code-exists";
import { isPossibleShortCode } from "@/lib/middleware/utils/is-possible-short-code";
import { isReservedKey } from "@/lib/middleware/utils/is-reserved-key";
import { rewriteNotFound } from "@/lib/middleware/utils/rewrite-not-found";

/**
 * Answers unknown codes with a real 404 before the page renders. The analytics page
 * streams behind a prerendered shell, so a notFound() there can only keep the 200.
 * `shortCode` is `""` when the path segment couldn't be decoded.
 */
export async function AnalyticsMiddleware(req: NextRequest, shortCode: string) {
  // Anything that can't be a code (empty, too long, control characters, `.`) skips the lookup.
  if (!isPossibleShortCode(shortCode) || isReservedKey(shortCode)) {
    return notFound(req);
  }

  try {
    if (!(await shortCodeExists(shortCode))) return notFound(req);
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
