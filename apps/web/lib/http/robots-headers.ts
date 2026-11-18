/**
 * `X-Robots-Tag` rules for the per-link utility pages (wired up in `next.config.ts`).
 *
 * These pages stream their content behind a prerendered shell, so a notFound() inside the stream
 * keeps the 200 status. The header goes out with the response head before anything streams, and
 * applies whether or not the proxy ran or the lookup found the link, so such a response is never
 * indexed.
 */
export const NOINDEX_HEADER = { key: "X-Robots-Tag", value: "noindex, nofollow" };

export const NOINDEX_SOURCES = ["/analytics/:shortCode", "/preview/:shortCode"] as const;

export function noindexHeaderRules() {
  return NOINDEX_SOURCES.map((source) => ({ source, headers: [NOINDEX_HEADER] }));
}
