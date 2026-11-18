import { eq, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { issueAction } from "@/lib/actions/issue-link";
import { db } from "@/lib/db";
import { rateLimits, urlMappings } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { RATE_LIMITED_MESSAGE } from "@/lib/links/issue-link";
import { UNSAFE_URL_MESSAGE } from "@/lib/links/safe-browsing/advisory";
import { clientKey } from "@/lib/rate-limit/client-key";
import { resetUrlTables } from "../utils/reset-db";

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));

const checkUrlSafety = vi.hoisted(() => vi.fn<(url: string) => Promise<"safe" | "unsafe" | "unknown">>(async () => "safe"));
vi.mock("@/lib/links/safe-browsing", () => ({ checkUrlSafety }));

resetUrlTables();

afterEach(() => {
  requestHeaders.current = new Headers();
  checkUrlSafety.mockClear();
});

const form = (originalUrl?: string) => {
  const data = new FormData();
  if (originalUrl !== undefined) data.set("originalUrl", originalUrl);
  return data;
};

const submit = (originalUrl?: string, headers: Record<string, string> = {}) => {
  requestHeaders.current = new Headers(headers);
  return issueAction(null, form(originalUrl));
};

const keyFor = (ip: string | null) => clientKey(ip, getEnv().RATE_LIMIT_SECRET);

const issueRateLimitKeys = async () =>
  (await db.select({ key: rateLimits.key }).from(rateLimits).where(eq(rateLimits.scope, "issue"))).map((row) => row.key);

// Fills the current window for `ip` so its next request is over the limit.
const exhaustLimit = async (ip: string) => {
  const { ISSUE_RATE_LIMIT_MAX: max, ISSUE_RATE_LIMIT_WINDOW_SECONDS: windowSeconds } = getEnv();
  await db.execute(sql`
    INSERT INTO rate_limits (scope, key, window_start, count)
    VALUES ('issue', ${keyFor(ip)}, date_bin(make_interval(secs => ${windowSeconds}::int), now(), timestamptz 'epoch'), ${max})
  `);
};

describe("issueAction", () => {
  it("issues a link and stores it", async () => {
    const state = await submit("https://example.com/page", { "x-real-ip": "203.0.113.7" });

    expect(state).toStrictEqual({
      ok: true,
      shortCode: expect.stringMatching(/^[a-z]+(-[a-z]+)+$/),
      shortUrl: expect.stringMatching(/^http:\/\/localhost:3000\/[a-z]+(-[a-z]+)+$/),
      originalUrl: "https://example.com/page",
    });
    if (!state?.ok) throw new Error("expected a success");
    expect(state.shortUrl).toBe(`http://localhost:3000/${state.shortCode}`);
    const rows = await db.select().from(urlMappings).where(eq(urlMappings.shortCode, state.shortCode));
    expect(rows).toHaveLength(1);
    expect(rows[0].originalUrl).toBe("https://example.com/page");
  });

  it("returns the unsafe_url reason without the HTTP status when Safe Browsing flags the URL", async () => {
    checkUrlSafety.mockResolvedValueOnce("unsafe");

    const state = await submit("https://phish.example/login", { "x-real-ip": "203.0.113.7" });

    expect(state).toStrictEqual({ ok: false, reason: "unsafe_url", message: UNSAFE_URL_MESSAGE });
    expect(await db.select().from(urlMappings)).toHaveLength(0);
  });

  it("returns the rate_limited reason and retryAfterSeconds without the HTTP status", async () => {
    await exhaustLimit("203.0.113.7");

    const state = await submit("https://example.com", { "x-real-ip": "203.0.113.7" });

    expect(state).toStrictEqual({
      ok: false,
      reason: "rate_limited",
      message: RATE_LIMITED_MESSAGE,
      retryAfterSeconds: expect.any(Number),
    });
    if (state?.ok !== false || !("retryAfterSeconds" in state)) throw new Error("expected a rate-limited failure");
    expect(state.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(state.retryAfterSeconds).toBeLessThanOrEqual(getEnv().ISSUE_RATE_LIMIT_WINDOW_SECONDS);
    expect(checkUrlSafety).not.toHaveBeenCalledWith("https://example.com");
    expect(await db.select().from(urlMappings)).toHaveLength(0);
  });

  it.each([
    ["a missing URL field", undefined, "URL is required"],
    ["a blank URL", "", "URL is required"],
    ["an invalid URL", "not-a-url", "Must be a valid http or https URL"],
  ])("returns only the message for %s", async (_name, originalUrl, message) => {
    const state = await submit(originalUrl, { "x-real-ip": "203.0.113.7" });

    expect(state).toStrictEqual({ ok: false, message });
    expect(await issueRateLimitKeys()).toEqual([]);
  });

  describe("rate-limit key", () => {
    it("uses x-real-ip over x-forwarded-for", async () => {
      await submit("https://example.com", { "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.4" });

      expect(await issueRateLimitKeys()).toEqual([keyFor("203.0.113.7")]);
    });

    it("falls back to the first x-forwarded-for entry", async () => {
      await submit("https://example.com", { "x-forwarded-for": "198.51.100.4, 10.0.0.1" });

      expect(await issueRateLimitKeys()).toEqual([keyFor("198.51.100.4")]);
    });

    it("uses the shared unknown bucket when neither header is present", async () => {
      await submit("https://example.com");

      expect(await issueRateLimitKeys()).toEqual([keyFor(null)]);
    });

    it("limits only the client whose address is over the limit", async () => {
      await exhaustLimit("203.0.113.7");

      expect(await submit("https://example.com", { "x-real-ip": "203.0.113.7" })).toMatchObject({ ok: false, reason: "rate_limited" });
      expect(await submit("https://example.com", { "x-real-ip": "203.0.113.8" })).toMatchObject({ ok: true });
      expect(await submit("https://example.com", { "x-forwarded-for": "203.0.113.7" })).toMatchObject({
        ok: false,
        reason: "rate_limited",
      });
    });
  });
});
