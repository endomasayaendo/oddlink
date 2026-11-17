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

  describe("Content-Type", () => {
    const body = JSON.stringify({ originalUrl: "https://example.com" });

    it.each(["application/json", "application/json; charset=utf-8", "Application/JSON;charset=UTF-8"])(
      "accepts %s",
      async (contentType) => {
        expect((await post(body, { "content-type": contentType })).status).toBe(200);
      },
    );

    it.each(["text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x", "application/jsonp", "application/json-patch+json", ""])(
      "returns 415 for %j before rate limiting or Safe Browsing",
      async (contentType) => {
        checkIssueRateLimit.mockClear();
        checkUrlSafety.mockClear();
        const res = await post(body, { "content-type": contentType });
        expect(res.status).toBe(415);
        expect(await res.json()).toEqual({ message: "Content-Type must be application/json" });
        expect(checkIssueRateLimit).not.toHaveBeenCalled();
        expect(checkUrlSafety).not.toHaveBeenCalled();
      },
    );

    it("returns 415 without reading the body", async () => {
      const req = new Request("http://localhost:3000/api/issue", { method: "POST", headers: { "content-type": "text/plain" }, body });
      expect((await POST(req)).status).toBe(415);
      expect(req.bodyUsed).toBe(false);
    });
  });

  describe("body size", () => {
    const LIMIT = 16 * 1024;
    const oversized = JSON.stringify({ originalUrl: "https://example.com", pad: "x".repeat(LIMIT) });

    const streamOf = (text: string, chunkSize = 1024) => {
      const bytes = new TextEncoder().encode(text);
      let offset = 0;
      let pulled = 0;
      let cancelled = false;
      const stream = new ReadableStream<Uint8Array>({
        pull(controller) {
          if (offset >= bytes.byteLength) return controller.close();
          controller.enqueue(bytes.slice(offset, offset + chunkSize));
          offset += chunkSize;
          pulled += 1;
        },
        cancel() {
          cancelled = true;
        },
      });
      return { stream, stats: () => ({ pulled, cancelled, totalChunks: Math.ceil(bytes.byteLength / chunkSize) }) };
    };

    const streamedRequest = (stream: ReadableStream<Uint8Array>, headers: Record<string, string> = {}) =>
      new Request("http://localhost:3000/api/issue", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: stream,
        duplex: "half",
      } as RequestInit);

    it("accepts a body just under the limit", async () => {
      const prefix = JSON.stringify({ originalUrl: "https://example.com", pad: "" });
      const body = JSON.stringify({ originalUrl: "https://example.com", pad: "x".repeat(LIMIT - prefix.length) });
      expect(new TextEncoder().encode(body).byteLength).toBe(LIMIT);
      expect((await post(body)).status).toBe(200);
    });

    it("returns 413 from Content-Length without reading the body or counting toward the limit", async () => {
      checkIssueRateLimit.mockClear();
      checkUrlSafety.mockClear();
      const { stream, stats } = streamOf(oversized);
      const req = streamedRequest(stream, { "content-length": String(new TextEncoder().encode(oversized).byteLength) });
      const res = await POST(req);
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ message: "Request body is too large" });
      expect(req.bodyUsed).toBe(false);
      expect(stats().pulled).toBeLessThanOrEqual(1);
      expect(checkIssueRateLimit).not.toHaveBeenCalled();
      expect(checkUrlSafety).not.toHaveBeenCalled();
    });

    it("returns 413 for an oversized body with no Content-Length and stops reading it", async () => {
      checkIssueRateLimit.mockClear();
      checkUrlSafety.mockClear();
      const { stream, stats } = streamOf(oversized + " ".repeat(1024 * 1024));
      const req = streamedRequest(stream);
      expect(req.headers.get("content-length")).toBeNull();
      const res = await POST(req);
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual({ message: "Request body is too large" });
      const { pulled, cancelled, totalChunks } = stats();
      expect(cancelled).toBe(true);
      expect(pulled).toBeLessThan(totalChunks / 10);
      expect(checkIssueRateLimit).not.toHaveBeenCalled();
      expect(checkUrlSafety).not.toHaveBeenCalled();
    });

    it("returns 413 when Content-Length understates the body", async () => {
      const { stream } = streamOf(oversized);
      const res = await POST(streamedRequest(stream, { "content-length": "10" }));
      expect(res.status).toBe(413);
    });

    it("still parses a small streamed body with no Content-Length", async () => {
      const { stream } = streamOf(JSON.stringify({ originalUrl: "https://example.com" }), 4);
      expect((await POST(streamedRequest(stream))).status).toBe(200);
    });
  });
});
