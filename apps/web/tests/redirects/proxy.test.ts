import { eq, sql } from "drizzle-orm";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
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

describe("proxy redirects", () => {
  it("redirects to the original URL and has counted and logged the access by then", async () => {
    const link = await insertLink("go-code", "https://example.com/target", future());
    const response = await request("/go-code").res;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/target");
    expect(await countOf("go-code")).toBe(1);
    expect(await logsOf(link.id)).toBe(1);
  });

  it("redirects to the not-found page for an unknown code", async () => {
    const response = await request("/missing-code").res;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/not-found");
  });

  it("redirects to the not-found page for an expired code without counting it", async () => {
    const link = await insertLink("old-code", "https://example.com", past());
    expect((await request("/old-code").res).headers.get("location")).toBe("http://localhost:3000/not-found");
    expect(await countOf("old-code")).toBe(0);
    expect(await logsOf(link.id)).toBe(0);
  });

  it("redirects to the not-found page when the stored URL is unusable, without counting it", async () => {
    const link = await insertLink("bad-code", "https://example.com", future());
    await db.execute(sql`UPDATE url_mappings SET original_url = 'javascript:alert(1)' WHERE short_code = 'bad-code'`);
    expect((await request("/bad-code").res).headers.get("location")).toBe("http://localhost:3000/not-found");
    expect(await countOf("bad-code")).toBe(0);
    expect(await logsOf(link.id)).toBe(0);
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

  it.each(["/foo", "/analytics", "/api", "/foo.bar", "/robots.txt", "/_x", "/_next"])(
    "treats %s as a short code and sends it to the not-found page, like before",
    async (path) => {
      expect((await request(path).res).headers.get("location")).toBe("http://localhost:3000/not-found");
    },
  );

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

describe("proxy pass-through", () => {
  it.each(["/", "/not-found", "/favicon.ico", "/analytics/some-code", "/a/b"])(
    "lets %s reach the app",
    async (path) => {
      expect(passesThrough(await request(path).res)).toBe(true);
    },
  );
});

describe("proxy matcher", () => {
  it.each(["/some-code", "/not-found", "/favicon.ico", "/robots.txt", "/_next"])("runs on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each(["/", "/analytics/some-code", "/api/issue", "/_next/static/chunk.js", "/a/b"])("skips %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});
