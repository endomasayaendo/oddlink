import { notFound } from "next/navigation";

// The proxy rewrites unknown /analytics/{shortCode} requests here. The page itself
// can't answer 404: with Cache Components its prerendered shell is sent with a 200
// before the lookup runs. Calling notFound() while prerendering makes this route a
// static 404 that still renders app/analytics/not-found.tsx.
// "not-found" is a reserved key, so it never shadows a real short code.
export default function AnalyticsNotFoundPage() {
  notFound();
}
