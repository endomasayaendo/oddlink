import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { getLinkState } from "@/lib/links/link-state";
import { AnalyticsMiddleware } from "@/lib/middleware/analytics";
import { NOT_FOUND_CACHE_CONTROL } from "@/lib/middleware/utils/rewrite-not-found";

vi.mock("@/lib/links/link-state", () => ({
  getLinkState: vi.fn().mockRejectedValue(new Error("connection refused")),
}));

describe("AnalyticsMiddleware", () => {
  it("lets the page handle the request when the pre-check fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const req = new NextRequest("http://localhost:3000/analytics/some-code");
    const response = await AnalyticsMiddleware(req, "some-code");
    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it.each(["", "a".repeat(256), "\0", "foo.bar", "not-found"])("rewrites %j to the 404 page without a lookup", async (key) => {
    vi.mocked(getLinkState).mockClear();
    const req = new NextRequest("http://localhost:3000/analytics/x");
    const response = await AnalyticsMiddleware(req, key);
    expect(response.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/analytics/not-found");
    expect(response.headers.get("cache-control")).toBe(NOT_FOUND_CACHE_CONTROL);
    expect(getLinkState).not.toHaveBeenCalled();
  });
});
