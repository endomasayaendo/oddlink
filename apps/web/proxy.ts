import { type NextRequest, NextResponse, type ProxyConfig } from "next/server";
import { AnalyticsMiddleware } from "@/lib/middleware/analytics";
import { LinkMiddleware } from "@/lib/middleware/link";
import { isReservedKey } from "@/lib/middleware/utils/is-reserved-key";
import { parse } from "@/lib/middleware/utils/parse";

export const config: ProxyConfig = {
  // Only single-segment paths can be short links. `/analytics/{shortCode}` is checked
  // here too, so unknown codes get a real 404. Prefetches skip that check: they only
  // load the prerendered shell, and the navigation itself still comes through here.
  // `/`, `/api/...` and `/_next/...` never reach the proxy.
  matcher: [
    "/([^/]+)",
    { source: "/analytics/:shortCode", missing: [{ type: "header", key: "next-router-prefetch" }] },
  ],
};

export async function proxy(req: NextRequest) {
  const { key, analyticsKey } = parse(req);

  if (analyticsKey !== null) {
    return AnalyticsMiddleware(req, analyticsKey);
  }

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

  return LinkMiddleware(req, key);
}
