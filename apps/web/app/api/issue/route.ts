import { issueShortUrl } from "@/lib/links/issue-link";
import { ADVISORY_TEXT, ADVISORY_URL } from "@/lib/links/safe-browsing/advisory";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const originalUrl = (body as { originalUrl?: unknown } | null)?.originalUrl;

  const result = await issueShortUrl(originalUrl);
  if (!result.ok && "reason" in result) {
    // Google's terms require the attribution wherever a Safe Browsing warning is shown.
    return Response.json(
      { message: result.message, advisory: ADVISORY_TEXT, advisoryUrl: ADVISORY_URL },
      { status: result.status },
    );
  }
  if (!result.ok) {
    return Response.json({ message: result.message }, { status: result.status });
  }
  return Response.json({ shortUrl: result.shortUrl, originalUrl: result.originalUrl });
}
