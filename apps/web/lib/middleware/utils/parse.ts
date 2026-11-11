import type { NextRequest } from "next/server";

/**
 * Splits the request path.
 * - `key` is set only for single-segment paths like `/golden-clock-whispers`, the only shape a
 *   short link can take. `preview` is true when that segment ended in one `+`
 *   (`/golden-clock-whispers+`); `key` is then the code without it. The segment is decoded first,
 *   so `/code+` and `/code%2B` mean the same thing. Anything else ending in `+` (`/code++`)
 *   leaves a `+` in `key`, which is never a possible short code.
 * - `analyticsKey` is set only for `/analytics/{shortCode}`: the decoded code, or `""`
 *   when it can't be decoded. It is `null` for every other path.
 * - `previewPageKey` is the same for `/preview/{shortCode}`, the page `/code+` is rewritten to.
 */
export function parse(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const segments = path.split("/").filter(Boolean);
  const single = segments.length === 1 ? safeDecode(segments[0]) : "";
  // A bare `+` is a preview of an empty key, so the proxy answers it with a 404 instead of passing it on.
  const preview = single.endsWith("+");
  const key = preview ? single.slice(0, -1) : single;
  const analyticsKey = segments.length === 2 && segments[0] === "analytics" ? safeDecode(segments[1]) : null;
  const previewPageKey = segments.length === 2 && segments[0] === "preview" ? safeDecode(segments[1]) : null;
  return { path, key, preview, analyticsKey, previewPageKey };
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}
