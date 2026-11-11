import { type NextRequest, NextResponse } from "next/server";
import { getLinkPreview } from "@/lib/links/get-link-preview";
import { isPossibleShortCode } from "@/lib/middleware/utils/is-possible-short-code";
import { isReservedKey } from "@/lib/middleware/utils/is-reserved-key";
import { NO_STORE_CACHE_CONTROL, rewriteNotFound } from "@/lib/middleware/utils/rewrite-not-found";

/**
 * Serves the preview page for `/code+` (`direct: false`, rewritten to `/preview/code`) and checks
 * direct `/preview/code` requests (`direct: true`, passed on). Both answer a code that has no
 * showable preview with the same real 404 as the short link, and never count a click.
 * `key` is `""` when the path segment couldn't be decoded.
 */
export async function PreviewMiddleware(req: NextRequest, key: string, { direct }: { direct: boolean }) {
  // Impossible keys (empty, too long, control characters, `.`, `+`) skip the lookup.
  // A reserved key like `not-found+` must not fall through to the app: it is no link.
  if (!isPossibleShortCode(key) || isReservedKey(key)) return notFound(req);

  try {
    if (!(await getLinkPreview(key))) return notFound(req);
  } catch (error) {
    console.error("Failed to look up link preview", error);
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": NO_STORE_CACHE_CONTROL } });
  }

  const res = direct ? NextResponse.next() : NextResponse.rewrite(new URL(`/preview/${encodeURIComponent(key)}`, req.url));
  // The page is live data about one code, and a preview isn't something to index.
  res.headers.set("Cache-Control", NO_STORE_CACHE_CONTROL);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  return res;
}

function notFound(req: NextRequest) {
  return rewriteNotFound(req, "/not-found");
}
