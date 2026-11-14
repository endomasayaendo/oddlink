import { issueShortUrl } from "@/lib/links/issue-link";
import { ADVISORY_TEXT, ADVISORY_URL } from "@/lib/links/safe-browsing/advisory";
import { getClientIp } from "@/lib/rate-limit/client-key";

export async function POST(request: Request) {
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
