import type { Metadata } from "next";
import { notFound } from "next/navigation";

// The 404 takes its title from this page, not from the not-found file it renders.
export const metadata: Metadata = {
  title: "Link not found - OddLink",
};

// The proxy rewrites unknown and expired short codes here. Calling notFound() while
// prerendering makes this route a static 404 that renders ./not-found.tsx.
// "not-found" is a reserved key, so it never shadows a real short code.
export default function LinkNotFoundPage() {
  notFound();
}
