import { type NextRequest, NextResponse } from "next/server";

// A 404'd code can be issued later, so the static 404 page must not be cached
// (Next would otherwise send the prerendered page with a long s-maxage).
export const NOT_FOUND_CACHE_CONTROL = "private, no-cache, no-store, max-age=0, must-revalidate";

/** Serves the static 404 page at `path` without changing the URL. */
export function rewriteNotFound(req: NextRequest, path: string) {
  const res = NextResponse.rewrite(new URL(path, req.url));
  res.headers.set("Cache-Control", NOT_FOUND_CACHE_CONTROL);
  return res;
}
