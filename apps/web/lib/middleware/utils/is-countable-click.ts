import { type NextRequest, userAgent } from "next/server";

/**
 * Whether a short-link GET counts as a click. Browser prefetches and known bots get the same
 * redirect but are not counted: a prefetch may never be followed by a visit, and a bot (link
 * previews, crawlers) is not a person clicking. Bots are only what Next's `userAgent().isBot`
 * recognises, so an unrecognised client is still counted rather than risk dropping real clicks.
 */
export function isCountableClick(req: NextRequest): boolean {
  return !isPrefetch(req.headers) && !userAgent(req).isBot;
}

/**
 * True when `Sec-Purpose` lists the `prefetch` token (e.g. `prefetch`, `prefetch;prerender`),
 * or the legacy `Purpose` header does. Tokens compare case-insensitively; parameters after `;`
 * are ignored.
 */
export function isPrefetch(headers: Headers): boolean {
  return hasPrefetchToken(headers.get("sec-purpose")) || hasPrefetchToken(headers.get("purpose"));
}

function hasPrefetchToken(value: string | null): boolean {
  if (!value) return false;
  return value.split(",").some((item) => item.split(";")[0].trim().toLowerCase() === "prefetch");
}
