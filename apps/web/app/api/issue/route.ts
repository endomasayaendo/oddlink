import { issueShortUrl } from "@/lib/links/issue-link";
import { ADVISORY_TEXT, ADVISORY_URL } from "@/lib/links/safe-browsing/advisory";
import { getClientIp } from "@/lib/rate-limit/client-key";
import { readJsonBody } from "@/lib/http/read-json-body";

// Generous for a JSON object holding one URL of at most 2048 characters, even fully escaped.
const MAX_BODY_BYTES = 16 * 1024;

// `application/json`, optionally with parameters such as `; charset=utf-8`.
const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;

export async function POST(request: Request) {
  // Checked before the body is read and before any limiter or Safe Browsing work. It also means a
  // cross-site form or `text/plain` fetch can't issue links without a CORS preflight.
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type")?.trim() ?? "")) {
    return Response.json({ message: "Content-Type must be application/json" }, { status: 415 });
  }

  // Also checked before the limiter or Safe Browsing, so an oversized body costs neither.
  const parsed = await readJsonBody(request, MAX_BODY_BYTES);
  if (!parsed.ok) {
    return Response.json({ message: "Request body is too large" }, { status: 413 });
  }
  const originalUrl = (parsed.body as { originalUrl?: unknown } | null)?.originalUrl;

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
