import { notFound } from "next/navigation";

// The proxy rewrites unknown and expired short codes here. Calling notFound() while
// prerendering makes this route a static 404 that renders ./not-found.tsx.
// "not-found" is a reserved key, so it never shadows a real short code.
export default function LinkNotFoundPage() {
  notFound();
}
