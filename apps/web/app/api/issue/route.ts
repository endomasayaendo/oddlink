import { issueShortUrl } from "@/lib/links/issue-link";
import { ADVISORY_TEXT, ADVISORY_URL } from "@/lib/links/safe-browsing/advisory";
import { getClientIp } from "@/lib/rate-limit/client-key";

// `application/json`, optionally with parameters such as `; charset=utf-8`.
const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;

export async function POST(request: Request) {
  // Checked before the body is read and before any limiter or Safe Browsing work. It also means a
  // cross-site form or `text/plain` fetch can't issue links without a CORS preflight.
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type")?.trim() ?? "")) {
    return Response.json({ message: "Content-Type must be application/json" }, { status: 415 });
  }

  const body: unknown = await request.json().catch(() => null);
  const originalUrl = (body as { originalUrl?: unknown } | null)?.originalUrl;

  const result = await issueShortUrl(originalUrl, { clientIp: getClientIp(request.headers) });
  if (!result.ok && result.reason === "unsafe_url") {
    // Google's terms require the attribution wherever a Safe Browsing warning is shown.
    return Response.json(
      { message: result.message, advisory: ADVISORY_TEXT, advisoryUrl: ADVISORY_URL },
      { status: result.status },
    );
  }
  if (!result.ok && result.reason === "rate_limited") {
    return Response.json(
      { message: result.message },
      { status: result.status, headers: { "Retry-After": String(result.retryAfterSeconds) } },
    );
  }
  if (!result.ok) {
    return Response.json({ message: result.message }, { status: result.status });
  }
  return Response.json({ shortUrl: result.shortUrl, originalUrl: result.originalUrl });
}

// The only methods this route answers. Next's own 405 for other methods carries no `Allow`, so
// each one is answered explicitly, and OPTIONS is spelled out so `GET` below isn't advertised.
const ALLOW = "OPTIONS, POST";

function methodNotAllowed() {
  return new Response(null, { status: 405, headers: { Allow: ALLOW } });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: ALLOW } });
}

// HEAD is answered by GET.
export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
export const PATCH = methodNotAllowed;
