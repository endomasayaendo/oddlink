import { issueShortUrl } from "@/lib/issue";

export async function POST(request: Request) {
  const body: unknown = await request.json().catch(() => null);
  const originalUrl = (body as { originalUrl?: unknown } | null)?.originalUrl;

  const result = await issueShortUrl(originalUrl);
  if (!result.ok) {
    return Response.json({ message: result.message }, { status: result.status });
  }
  return Response.json({ shortUrl: result.shortUrl, originalUrl: result.originalUrl });
}
