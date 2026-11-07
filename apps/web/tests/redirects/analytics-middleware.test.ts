import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { AnalyticsMiddleware } from "@/lib/middleware/analytics";

vi.mock("@/lib/analytics/short-code-exists", () => ({
  shortCodeExists: vi.fn().mockRejectedValue(new Error("connection refused")),
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
});
