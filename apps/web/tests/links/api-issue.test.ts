import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/issue/route";
import { resetUrlTables } from "../utils/reset-db";

const checkUrlSafety = vi.hoisted(() => vi.fn<(url: string) => Promise<"safe" | "unsafe" | "unknown">>(async () => "safe"));
vi.mock("@/lib/links/safe-browsing", () => ({ checkUrlSafety }));

resetUrlTables();

const checkIssueRateLimit = vi.hoisted(() =>
  vi.fn<(ip: string | null) => Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }>>(async () => ({
    allowed: true,
  })),
);
vi.mock("@/lib/rate-limit", () => ({ checkIssueRateLimit }));

const post = (body?: string, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost:3000/api/issue", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body,
    }),
  );

describe("POST /api/issue", () => {
  it("returns the short URL as JSON", async () => {
    const res = await post(JSON.stringify({ originalUrl: "https://example.com" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.originalUrl).toBe("https://example.com");
    expect(json.shortUrl).toMatch(/^http:\/\/localhost:3000\/[a-z]+(-[a-z]+)+$/);
  });

  it("returns 400 when the URL is blank", async () => {
    const res = await post(JSON.stringify({ originalUrl: "" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "URL is required" });
  });

  it("returns 400 when the URL is invalid", async () => {
    const res = await post(JSON.stringify({ originalUrl: "not-a-url" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "Must be a valid http or https URL" });
  });

  it("returns 400 when the URL has a username or password", async () => {
    const res = await post(JSON.stringify({ originalUrl: "https://google.com@evil.example" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ message: "URLs with a username or password are not allowed" });
  });

  it("returns 400 when the body is empty or not JSON", async () => {
    expect((await post()).status).toBe(400);
    expect((await post("{oops")).status).toBe(400);
  });

  it("returns 422 with Google's advisory when Safe Browsing flags the URL", async () => {
    checkUrlSafety.mockResolvedValueOnce("unsafe");
    const res = await post(JSON.stringify({ originalUrl: "https://phish.example/login" }));
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({
      message: "This URL may be unsafe (suspected phishing or malware), so it can't be shortened.",
      advisory: "Advisory provided by Google",
      advisoryUrl: "https://developers.google.com/safe-browsing/v4/advisory",
    });
  });

  it("still issues the link when the check is unavailable", async () => {
    checkUrlSafety.mockResolvedValueOnce("unknown");
    const res = await post(JSON.stringify({ originalUrl: "https://example.com" }));
    expect(res.status).toBe(200);
  });

  it("returns 429 with Retry-After and no Safe Browsing advisory when rate limited", async () => {
    checkIssueRateLimit.mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 37 });
    const res = await post(JSON.stringify({ originalUrl: "https://example.com" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("37");
    expect(await res.json()).toEqual({
      message: "You're creating links too quickly. Please try again in a few minutes.",
    });
  });

  it("keys the limit on the client address from the proxy headers", async () => {
    await post(JSON.stringify({ originalUrl: "https://example.com" }), { "x-forwarded-for": "198.51.100.4, 10.0.0.1" });
    expect(checkIssueRateLimit).toHaveBeenLastCalledWith("198.51.100.4");
    await post(JSON.stringify({ originalUrl: "https://example.com" }));
    expect(checkIssueRateLimit).toHaveBeenLastCalledWith(null);
  });
});
