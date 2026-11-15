import { NextResponse } from "next/server";
import { BASE_URL } from "@/lib/constants";
import { type GoneStatus, type GoneVariant, goneMessage, goneVariant } from "@/lib/links/gone";
import { NO_STORE_CACHE_CONTROL } from "@/lib/middleware/utils/rewrite-not-found";

export type { GoneStatus } from "@/lib/links/gone";

/** The status a disabled or deleted link is answered with. */
export const GONE_STATUS = 410;

/** Path of the static gone page with the wording for `variant`. */
export const gonePagePath = (variant: GoneVariant) => `/gone/${variant}`;

const GONE_HEADERS = {
  "Cache-Control": NO_STORE_CACHE_CONTROL,
  "X-Robots-Tag": "noindex",
};

// A prerendered page is always served with the status it was prerendered with, so a rewrite to
// it would answer 200. The proxy sends the page's HTML itself instead. The HTML only changes with
// a new build, so outside development each variant is fetched once per process.
const pages = new Map<GoneVariant, Promise<string>>();
const memoize = process.env.NODE_ENV === "production";

async function fetchGonePage(variant: GoneVariant): Promise<string> {
  // Fetched from the configured origin, never from the request's Host header.
  const res = await fetch(`${BASE_URL}${gonePagePath(variant)}`, { cache: "no-store", redirect: "error" });
  if (!res.ok) throw new Error(`Gone page ${variant} answered ${res.status}`);
  return res.text();
}

function gonePage(variant: GoneVariant): Promise<string> {
  const cached = pages.get(variant);
  if (cached) return cached;
  const page = fetchGonePage(variant);
  if (memoize) {
    pages.set(variant, page);
    page.catch(() => pages.delete(variant));
  }
  return page;
}

/**
 * Answers a disabled or deleted link with a 410 and the static gone page for its wording, under
 * the requested URL. Uncached, because a disable can be undone, and kept out of search results.
 * If the page can't be loaded, the 410 still goes out with the wording as plain text.
 */
export async function serveGone(status: GoneStatus) {
  const variant = goneVariant(status);
  try {
    const html = await gonePage(variant);
    return new NextResponse(html, {
      status: GONE_STATUS,
      headers: { ...GONE_HEADERS, "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (error) {
    console.error("Failed to load the gone page", error);
    return new NextResponse(goneMessage(variant), {
      status: GONE_STATUS,
      headers: { ...GONE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}
