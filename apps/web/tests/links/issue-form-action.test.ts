import { afterEach, describe, expect, it, vi } from "vitest";

const { issueShortUrl } = vi.hoisted(() => ({ issueShortUrl: vi.fn() }));

vi.mock("@/lib/links/issue-link", () => ({ issueShortUrl }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.7" }) }));

const { issueFormAction } = await import("@/lib/actions/issue-link");

const form = (originalUrl?: string) => {
  const data = new FormData();
  if (originalUrl !== undefined) data.set("originalUrl", originalUrl);
  return data;
};

afterEach(() => {
  issueShortUrl.mockReset();
});

describe("issueFormAction", () => {
  it("returns a success as is", async () => {
    const success = { ok: true, shortCode: "a-b", shortUrl: "http://localhost:3000/a-b", originalUrl: "https://example.com" };
    issueShortUrl.mockResolvedValue(success);

    await expect(issueFormAction(null, form("https://example.com"))).resolves.toEqual(success);
    expect(issueShortUrl).toHaveBeenCalledWith("https://example.com", expect.any(Object));
  });

  it("returns a failure without its HTTP status and with the submitted URL", async () => {
    issueShortUrl.mockResolvedValue({ ok: false, status: 422, reason: "unsafe_url", message: "Unsafe" });

    await expect(issueFormAction(null, form("https://bad.example"))).resolves.toEqual({
      ok: false,
      reason: "unsafe_url",
      message: "Unsafe",
      submitted: "https://bad.example",
    });
  });

  it("ignores the previous state", async () => {
    issueShortUrl.mockResolvedValue({ ok: false, status: 400, message: "Invalid URL" });
    const previous = { ok: false as const, message: "Earlier", submitted: "https://earlier.example" };

    await expect(issueFormAction(previous, form())).resolves.toEqual({ ok: false, message: "Invalid URL", submitted: "" });
  });
});
