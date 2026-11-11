import { eq, sql } from "drizzle-orm";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { NO_STORE_CACHE_CONTROL, NOT_FOUND_CACHE_CONTROL } from "@/lib/middleware/utils/rewrite-not-found";
import { config, proxy } from "@/proxy";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();
afterEach(() => vi.restoreAllMocks());

const insertLink = (shortCode: string, originalUrl: string, expiresAt: Date | null) =>
  db.insert(urlMappings).values({ shortCode, originalUrl, expiresAt }).returning().then((rows) => rows[0]);

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);
const countOf = async (shortCode: string) =>
  (await db.query.urlMappings.findFirst({ where: eq(urlMappings.shortCode, shortCode) }))!.accessCount;

const logsOf = (urlMappingId: number) => db.$count(accessLog, eq(accessLog.urlMappingId, urlMappingId));

function request(path: string, method = "GET") {
  return { res: proxy(new NextRequest(`http://localhost:3000${path}`, { method })) };
}

const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";
const rewriteOf = (res: Response) => res.headers.get("x-middleware-rewrite");

// Unknown and expired codes are served the static 404 page under the requested URL, uncached.
function expectNotFound(res: Response, page = "http://localhost:3000/not-found") {
  expect(rewriteOf(res)).toBe(page);
  expect(res.headers.get("location")).toBeNull();
  expect(res.headers.get("cache-control")).toBe(NOT_FOUND_CACHE_CONTROL);
}

describe("proxy redirects", () => {
  it("redirects to the original URL and has counted and logged the access by then", async () => {
    const link = await insertLink("go-code", "https://example.com/target", future());
    const response = await request("/go-code").res;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/target");
    expect(await countOf("go-code")).toBe(1);
    expect(await logsOf(link.id)).toBe(1);
  });

  it("serves the 404 page for an unknown code", async () => {
    expectNotFound(await request("/missing-code").res);
  });

  it("serves the 404 page for an unknown code on HEAD", async () => {
    expectNotFound(await request("/missing-code", "HEAD").res);
  });

  it("serves the 404 page for an expired code without counting it", async () => {
    const link = await insertLink("old-code", "https://example.com", past());
    expectNotFound(await request("/old-code").res);
    expect(await countOf("old-code")).toBe(0);
    expect(await logsOf(link.id)).toBe(0);
  });

  it("serves the 404 page when the stored URL is unusable, without counting it", async () => {
    const link = await insertLink("bad-code", "https://example.com", future());
    await db.execute(sql`UPDATE url_mappings SET original_url = 'javascript:alert(1)' WHERE short_code = 'bad-code'`);
    expectNotFound(await request("/bad-code").res);
    expect(await countOf("bad-code")).toBe(0);
    expect(await logsOf(link.id)).toBe(0);
  });

  // Counted and logged like any http(s) row (SQL can't tell), but toRedirectUrl refuses to redirect.
  it("serves the 404 page when the stored URL has userinfo", async () => {
    await insertLink("phish-code", "https://example.com", future());
    await db.execute(
      sql`UPDATE url_mappings SET original_url = 'https://google.com@evil.example' WHERE short_code = 'phish-code'`,
    );
    expectNotFound(await request("/phish-code").res);
  });

  it("redirects a stored URL without // the way URL parsing reads it, and counts it", async () => {
    const link = await insertLink("odd-code", "https://example.com", future());
    await db.execute(sql`UPDATE url_mappings SET original_url = 'https:example.com/x' WHERE short_code = 'odd-code'`);
    expect((await request("/odd-code").res).headers.get("location")).toBe("https://example.com/x");
    expect(await countOf("odd-code")).toBe(1);
    expect(await logsOf(link.id)).toBe(1);
  });

  it("answers 503 instead of throwing when the database write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "execute").mockRejectedValueOnce(new Error("connection lost"));
    expect((await request("/some-code").res).status).toBe(503);
    expect(console.error).toHaveBeenCalled();
  });

  it.each(["/foo", "/analytics", "/api", "/_x", "/_next"])(
    "treats %s as a short code and serves the 404 page for it",
    async (path) => {
      expectNotFound(await request(path).res);
    },
  );

  it.each([
    ["a NUL", "/%00"],
    ["a tab", "/%09"],
    ["DEL", "/%7F"],
    ["a key over 255 characters", `/${"a".repeat(256)}`],
    ["a key over 255 code points", `/${encodeURIComponent("😀".repeat(256))}`],
    ["a file name", "/robots.txt"],
    ["a dotted key", "/foo.bar"],
    ["an icon path", "/apple-touch-icon.png"],
  ])("serves the 404 page for %s without touching the database", async (_, path) => {
    const execute = vi.spyOn(db, "execute");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    expectNotFound(await request(path).res);
    expect(execute).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
    expect(await db.$count(accessLog)).toBe(0);
  });

  it.each([
    ["a generated phrase", "golden-clock-whispers-to-silent-butterfly"],
    ["a 255-character code", "a".repeat(255)],
    ["a 255-code-point code", "😀".repeat(255)],
  ])("still redirects and counts %s", async (_, code) => {
    const link = await insertLink(code, "https://example.com/target", future());
    const response = await request(`/${encodeURIComponent(code)}`).res;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/target");
    expect(await countOf(code)).toBe(1);
    expect(await logsOf(link.id)).toBe(1);
  });

  it("counts HEAD requests like GET", async () => {
    await insertLink("head-code", "https://example.com", future());
    const response = await request("/head-code", "HEAD").res;
    expect(response.status).toBe(302);
    expect(await countOf("head-code")).toBe(1);
  });

  it.each(["POST", "PUT", "DELETE", "PATCH"])("answers %s with 405 without counting a click", async (method) => {
    const link = await insertLink("go-code", "https://example.com", future());
    expect((await request("/go-code", method).res).status).toBe(405);
    expect(await countOf("go-code")).toBe(0);
    expect(await logsOf(link.id)).toBe(0);
  });

  it("answers OPTIONS with the allowed methods without counting a click", async () => {
    await insertLink("go-code", "https://example.com", future());
    const response = await request("/go-code", "OPTIONS").res;
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
    expect(await countOf("go-code")).toBe(0);
  });
});

describe("proxy analytics check", () => {

  it("lets an existing code reach the analytics page", async () => {
    await insertLink("stats-code", "https://example.com", future());
    expect(passesThrough(await request("/analytics/stats-code").res)).toBe(true);
  });

  it("lets an expired code reach the analytics page", async () => {
    await insertLink("old-stats", "https://example.com", past());
    expect(passesThrough(await request("/analytics/old-stats").res)).toBe(true);
  });

  it("rewrites an unknown code to the static 404 page", async () => {
    expectNotFound(await request("/analytics/missing-code").res, "http://localhost:3000/analytics/not-found");
  });

  it.each([
    ["an undecodable code", "/analytics/%E0%A4%A"],
    ["a reserved key", "/analytics/not-found"],
    ["a code longer than the column", `/analytics/${"a".repeat(256)}`],
    ["a code with a NUL", "/analytics/%00"],
    ["a code with a dot", "/analytics/foo.bar"],
  ])("rewrites %s to the static 404 page", async (_, path) => {
    expectNotFound(await request(path).res, "http://localhost:3000/analytics/not-found");
  });

  it("decodes the code like the page's params", async () => {
    await insertLink("café-code", "https://example.com", future());
    expect(passesThrough(await request(`/analytics/${encodeURIComponent("café-code")}`).res)).toBe(true);
  });

  it("does not count a click", async () => {
    const link = await insertLink("stats-code", "https://example.com", future());
    await request("/analytics/stats-code").res;
    expect(await countOf("stats-code")).toBe(0);
    expect(await logsOf(link.id)).toBe(0);
  });
});

describe("proxy preview", () => {
  const expectPreview = (res: Response, code: string) => {
    expect(rewriteOf(res)).toBe(`http://localhost:3000/preview/${encodeURIComponent(code)}`);
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("cache-control")).toBe(NO_STORE_CACHE_CONTROL);
    expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  };

  it("rewrites /code+ to the preview page without redirecting or counting", async () => {
    const link = await insertLink("go-code", "https://example.com/target", future());
    expectPreview(await request("/go-code+").res, "go-code");
    expect(await countOf("go-code")).toBe(0);
    expect(await logsOf(link.id)).toBe(0);
  });

  it("previews on HEAD too, without counting", async () => {
    await insertLink("go-code", "https://example.com", future());
    expectPreview(await request("/go-code+", "HEAD").res, "go-code");
    expect(await countOf("go-code")).toBe(0);
  });

  it.each(["%2B", "%2b"])("treats an encoded plus (%s) like a literal one", async (plus) => {
    await insertLink("go-code", "https://example.com", future());
    expectPreview(await request(`/go-code${plus}`).res, "go-code");
    expect(await countOf("go-code")).toBe(0);
  });

  it("encodes a non-ASCII code in the rewrite target", async () => {
    await insertLink("café-😀-code", "https://example.com", future());
    const res = await request(`/${encodeURIComponent("café-😀-code")}+`).res;
    expectPreview(res, "café-😀-code");
    expect(rewriteOf(res)).toBe("http://localhost:3000/preview/caf%C3%A9-%F0%9F%98%80-code");
  });

  it("previews an expired link without counting it", async () => {
    const link = await insertLink("old-code", "https://example.com", past());
    expectPreview(await request("/old-code+").res, "old-code");
    expect(await countOf("old-code")).toBe(0);
    expect(await logsOf(link.id)).toBe(0);
  });

  it("serves the 404 page for an unknown code", async () => {
    expectNotFound(await request("/missing-code+").res);
  });

  it("serves the 404 page when the stored URL is unusable", async () => {
    await insertLink("bad-code", "https://example.com", future());
    await db.execute(sql`UPDATE url_mappings SET original_url = 'javascript:alert(1)' WHERE short_code = 'bad-code'`);
    expectNotFound(await request("/bad-code+").res);
  });

  it("serves the 404 page when the stored URL has userinfo", async () => {
    await insertLink("phish-code", "https://example.com", future());
    await db.execute(
      sql`UPDATE url_mappings SET original_url = 'https://google.com@evil.example' WHERE short_code = 'phish-code'`,
    );
    expectNotFound(await request("/phish-code+").res);
    expect(await countOf("phish-code")).toBe(0);
  });

  it.each([
    ["a bare plus", "/+"],
    ["two pluses", "/++"],
    ["a doubled suffix", "/code++"],
    ["an encoded doubled suffix", "/code%2B%2B"],
    ["a NUL", "/%00+"],
    ["a dotted key", "/a.b+"],
    ["a 256-character key", `/${"a".repeat(256)}+`],
  ])("serves the 404 page for %s without touching the database", async (_, path) => {
    const execute = vi.spyOn(db, "execute");
    expectNotFound(await request(path).res);
    expect(execute).not.toHaveBeenCalled();
  });

  it.each(["/not-found+", "/favicon.ico+"])("serves the 404 page for %s instead of passing it on", async (path) => {
    expectNotFound(await request(path).res);
  });

  it("serves the 404 page for a doubled suffix on an existing code", async () => {
    await insertLink("plain", "https://example.com", future());
    expectNotFound(await request("/plain++").res);
  });

  it("answers 503 and does not cache it when the lookup fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(db, "select").mockImplementationOnce(() => {
      throw new Error("connection lost");
    });
    const res = await request("/some-code+").res;
    expect(res.status).toBe(503);
    expect(res.headers.get("cache-control")).toBe(NO_STORE_CACHE_CONTROL);
  });

  it.each(["POST", "PUT", "DELETE", "PATCH"])("answers %s with 405 without a lookup", async (method) => {
    const execute = vi.spyOn(db, "execute");
    await insertLink("go-code", "https://example.com", future());
    expect((await request("/go-code+", method).res).status).toBe(405);
    expect(execute).not.toHaveBeenCalled();
    expect(await countOf("go-code")).toBe(0);
  });

  it("answers OPTIONS with the allowed methods", async () => {
    const response = await request("/go-code+", "OPTIONS").res;
    expect(response.status).toBe(204);
    expect(response.headers.get("allow")).toBe("GET, HEAD, OPTIONS");
  });

  it("still redirects and counts /code", async () => {
    const link = await insertLink("go-code", "https://example.com/target", future());
    const response = await request("/go-code").res;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/target");
    expect(await countOf("go-code")).toBe(1);
    expect(await logsOf(link.id)).toBe(1);
  });

  it("does not take /analytics/code+ for a code", async () => {
    await insertLink("go-code", "https://example.com", future());
    expectNotFound(await request("/analytics/go-code+").res, "http://localhost:3000/analytics/not-found");
  });

  describe("direct /preview/{shortCode}", () => {
    it("passes an existing code through with the no-store and noindex headers", async () => {
      await insertLink("go-code", "https://example.com", future());
      const res = await request("/preview/go-code").res;
      expect(passesThrough(res)).toBe(true);
      expect(res.headers.get("cache-control")).toBe(NO_STORE_CACHE_CONTROL);
      expect(res.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect(await countOf("go-code")).toBe(0);
    });

    it("passes an expired code through", async () => {
      await insertLink("old-code", "https://example.com", past());
      expect(passesThrough(await request("/preview/old-code").res)).toBe(true);
    });

    it.each(["/preview/missing-code", "/preview/a.b", "/preview/code+", "/preview/%E0%A4%A", "/preview/not-found"])(
      "serves the 404 page for %s",
      async (path) => {
        expectNotFound(await request(path).res);
      },
    );

    it("serves the 404 page when the stored URL is unusable", async () => {
      await insertLink("bad-code", "https://example.com", future());
      await db.execute(sql`UPDATE url_mappings SET original_url = 'javascript:alert(1)' WHERE short_code = 'bad-code'`);
      expectNotFound(await request("/preview/bad-code").res);
    });
  });
});

describe("proxy pass-through", () => {
  it.each(["/", "/not-found", "/favicon.ico", "/a/b"])(
    "lets %s reach the app",
    async (path) => {
      expect(passesThrough(await request(path).res)).toBe(true);
    },
  );
});

describe("proxy matcher", () => {
  it.each(["/some-code", "/not-found", "/favicon.ico", "/robots.txt", "/_next", "/analytics/some-code", "/preview/some-code", "/some-code+"])("runs on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each(["/", "/analytics/a/b", "/preview/a/b", "/api/issue", "/_next/static/chunk.js", "/a/b"])("skips %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });

  it.each(["/analytics/some-code", "/preview/some-code"])("skips the %s check for prefetches", (url) => {
    const headers = { "next-router-prefetch": "1" };
    expect(unstable_doesMiddlewareMatch({ config, url, headers })).toBe(false);
  });
});
