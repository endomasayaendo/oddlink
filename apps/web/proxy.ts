import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { LinkMiddleware } from "@/lib/middleware/link";
import { isReservedKey } from "@/lib/middleware/utils/is-reserved-key";
import { parse } from "@/lib/middleware/utils/parse";

export const config = {
  matcher: [
    /*
     * Match all paths except for:
     * 1. /api/ routes
     * 2. /_next/ (Next.js internals)
     * 3. files with an extension (favicon.ico, robots.txt, images, ...)
     */
    "/((?!api/|_next/|.*\\..*).*)",
  ],
};

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { key } = parse(req);

  // `/` (including Server Action posts to it) and app routes render as usual.
  if (!key || isReservedKey(key)) {
    return NextResponse.next();
  }

  return LinkMiddleware(req, ev, key);
}
