import { type NextFetchEvent, type NextRequest, NextResponse } from "next/server";
import { LinkMiddleware } from "@/lib/middleware/link";
import { isReservedKey } from "@/lib/middleware/utils/is-reserved-key";
import { parse } from "@/lib/middleware/utils/parse";

export const config = {
  // Only single-segment paths can be short links; `/`, `/analytics/...`, `/api/...`
  // and `/_next/...` never reach the proxy.
  matcher: ["/([^/]+)"],
};

export async function proxy(req: NextRequest, ev: NextFetchEvent) {
  const { key } = parse(req);

  if (!key || isReservedKey(key)) {
    return NextResponse.next();
  }

  // Mirror what a GET-only route handler answers, so other methods never count as clicks.
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS" } });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new NextResponse(null, { status: 405 });
  }

  return LinkMiddleware(req, ev, key);
}
