import type { NextRequest } from "next/server";

/**
 * Splits the request path. `key` is set only for single-segment paths like
 * `/golden-clock-whispers`, the only shape a short link can take.
 * `analyticsKey` is set only for `/analytics/{shortCode}`: the decoded code, or `""`
 * when it can't be decoded. It is `null` for every other path.
 */
export function parse(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const segments = path.split("/").filter(Boolean);
  const key = segments.length === 1 ? safeDecode(segments[0]) : "";
  const analyticsKey = segments.length === 2 && segments[0] === "analytics" ? safeDecode(segments[1]) : null;
  return { path, key, analyticsKey };
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}
