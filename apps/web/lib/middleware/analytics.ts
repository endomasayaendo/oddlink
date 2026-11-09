import { type NextRequest, NextResponse } from "next/server";
import { shortCodeExists } from "@/lib/analytics/short-code-exists";
import { SHORT_CODE_MAX_LENGTH } from "@/lib/db/schema";
import { isReservedKey } from "@/lib/middleware/utils/is-reserved-key";

/**
 * Answers unknown codes with a real 404 before the page renders. The analytics page
 * streams behind a prerendered shell, so a notFound() there can only keep the 200.
 * `shortCode` is `""` when the path segment couldn't be decoded.
 */
export async function AnalyticsMiddleware(req: NextRequest, shortCode: string) {
  // Anything longer than the short_code column can't be a code; skip the lookup.
  if (!shortCode || shortCode.length > SHORT_CODE_MAX_LENGTH || isReservedKey(shortCode)) {
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
  return NextResponse.rewrite(new URL("/analytics/not-found", req.url));
}
