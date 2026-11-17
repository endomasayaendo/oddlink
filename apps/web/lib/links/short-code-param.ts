import { notFound } from "next/navigation";

/**
 * Next hands a dynamic segment to a page percent-encoded: it decodes the path segment to match the
 * route, then encodes the value again with `encodeURIComponent` before passing it on. The proxy
 * works on the decoded segment, so decoding exactly once here gives the page the same code the
 * proxy looked up (`ねこ-🐱` stays `ねこ-🐱`, and a literal `%` sent as `%25` stays `%`).
 */
export function decodeShortCodeParam(raw: string): string | null {
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

/** The page's short code, decoded; a value that can't be decoded is answered with notFound(). */
export async function shortCodeFromParams(params: Promise<{ shortCode: string }>): Promise<string> {
  const shortCode = decodeShortCodeParam((await params).shortCode);
  if (shortCode === null) notFound();
  return shortCode;
}
