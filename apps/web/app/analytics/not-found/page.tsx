import type { Metadata } from "next";
import { notFound } from "next/navigation";

// The 404 takes its title from this page, not from the not-found file it renders.
export const metadata: Metadata = {
  title: "Short code not found - OddLink",
};

// The proxy rewrites unknown /analytics/{shortCode} requests here. The page itself
// can't answer 404: with Cache Components its prerendered shell is sent with a 200
// before the lookup runs. Calling notFound() while prerendering makes this route a
// static 404 that still renders app/analytics/not-found.tsx.
// "not-found" is a reserved key, so it never shadows a real short code.
export default function AnalyticsNotFoundPage() {
  notFound();
}
