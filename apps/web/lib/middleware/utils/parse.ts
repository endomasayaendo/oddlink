import type { NextRequest } from "next/server";

/**
 * Splits the request path. `key` is set only for single-segment paths like
 * `/golden-clock-whispers`, the only shape a short link can take.
 */
export function parse(req: NextRequest) {
  const path = req.nextUrl.pathname;
  const segments = path.split("/").filter(Boolean);
  const key = segments.length === 1 ? safeDecode(segments[0]) : "";
  return { path, key };
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return "";
  }
}
