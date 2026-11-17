import { getDynamicParam } from "next/dist/shared/lib/router/utils/get-dynamic-param";
import { getRouteMatcher } from "next/dist/shared/lib/router/utils/route-matcher";
import { getRouteRegex } from "next/dist/shared/lib/router/utils/route-regex";

/**
 * The `shortCode` value Next passes to the page at `route` for a request to `pathname`, built with
 * Next's own route matching and param encoding so tests follow what a real request delivers.
 */
export function nextShortCodeParam(route: string, pathname: string): string {
  const matched = getRouteMatcher(getRouteRegex(route))(pathname);
  if (!matched) throw new Error(`${pathname} does not match ${route}`);
  const { value } = getDynamicParam(matched, "shortCode", "d", null, null);
  if (typeof value !== "string") throw new Error("expected a single-segment param");
  return value;
}
