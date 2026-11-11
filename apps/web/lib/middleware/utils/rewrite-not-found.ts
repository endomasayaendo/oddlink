import { type NextRequest, NextResponse } from "next/server";

// Responses that depend on live data must not be cached: Next would otherwise send a
// prerendered page with a long s-maxage, and a code can be issued (or expire) later.
export const NO_STORE_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

// A 404'd code can be issued later, so the static 404 page must not be cached.
export const NOT_FOUND_CACHE_CONTROL = NO_STORE_CACHE_CONTROL;

/** Serves the static 404 page at `path` without changing the URL. */
export function rewriteNotFound(req: NextRequest, path: string) {
  const res = NextResponse.rewrite(new URL(path, req.url));
  res.headers.set("Cache-Control", NOT_FOUND_CACHE_CONTROL);
  return res;
}
