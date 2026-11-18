import type { MetadataRoute } from "next";

// Pages that must stay out of search results (previews, analytics, gone and 404 pages) carry
// noindex instead of a Disallow: a disallowed URL is never fetched, so a crawler would not see
// the noindex and could still list the bare URL. Short links redirect, so only their targets
// can be indexed. The API answers requests from the app, not pages.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
  };
}
