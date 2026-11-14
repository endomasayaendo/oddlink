import { describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/issue/route";
import { resetUrlTables } from "../utils/reset-db";

const checkUrlSafety = vi.hoisted(() => vi.fn<(url: string) => Promise<"safe" | "unsafe" | "unknown">>(async () => "safe"));
vi.mock("@/lib/links/safe-browsing", () => ({ checkUrlSafety }));

resetUrlTables();

const post = (body?: string) =>
  POST(new Request("http://localhost:3000/api/issue", { method: "POST", headers: { "content-type": "application/json" }, body }));

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
});
