import { type NextRequest, NextResponse, type ProxyConfig } from "next/server";
import { AnalyticsMiddleware } from "@/lib/middleware/analytics";
import { LinkMiddleware } from "@/lib/middleware/link";
import { PreviewMiddleware } from "@/lib/middleware/preview";
import { isReservedKey } from "@/lib/middleware/utils/is-reserved-key";
import { parse } from "@/lib/middleware/utils/parse";

export const config: ProxyConfig = {
  // Only single-segment paths can be short links (or `/code+` previews). `/analytics/{shortCode}`
  // and `/preview/{shortCode}` are checked here too, so unknown codes get a real 404. Prefetches
  // skip those checks: they only load the prerendered shell, and the navigation itself still
  // comes through here. `/`, `/api/...` and `/_next/...` never reach the proxy.
  matcher: [
    "/([^/]+)",
    { source: "/analytics/:shortCode", missing: [{ type: "header", key: "next-router-prefetch" }] },
    { source: "/preview/:shortCode", missing: [{ type: "header", key: "next-router-prefetch" }] },
  ],
};

export async function proxy(req: NextRequest) {
  const { key, preview, analyticsKey, previewPageKey } = parse(req);

  if (analyticsKey !== null) {
    return AnalyticsMiddleware(req, analyticsKey);
  }

  if (previewPageKey !== null) {
    return PreviewMiddleware(req, previewPageKey, { direct: true });
  }

  // A preview with an empty key (`/+`) goes on to a 404 rather than to the app.
  if (!preview && (!key || isReservedKey(key))) {
    return NextResponse.next();
  }

  // Mirror what a GET-only route handler answers, so other methods never count as clicks.
  if (req.method === "OPTIONS") {
    return new NextResponse(null, { status: 204, headers: { Allow: "GET, HEAD, OPTIONS" } });
  }
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new NextResponse(null, { status: 405 });
  }

  if (preview) {
    return PreviewMiddleware(req, key, { direct: false });
  }

  return LinkMiddleware(req, key);
}
