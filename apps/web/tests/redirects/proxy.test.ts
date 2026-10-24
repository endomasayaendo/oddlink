import { eq, sql } from "drizzle-orm";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { config, proxy } from "@/proxy";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const insertLink = (shortCode: string, originalUrl: string, expiresAt: Date | null) =>
  db.insert(urlMappings).values({ shortCode, originalUrl, expiresAt }).returning().then((rows) => rows[0]);

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);

// Collects waitUntil() work so tests can await it like the runtime would.
function request(path: string) {
  const pending: Promise<unknown>[] = [];
  const ev = { waitUntil: (p: Promise<unknown>) => void pending.push(p) } as Parameters<typeof proxy>[1];
  const res = proxy(new NextRequest(`http://localhost:3000${path}`), ev);
  return { res, settled: async () => Promise.all(pending) };
}

const passesThrough = (res: Response) => res.headers.get("x-middleware-next") === "1";

describe("proxy redirects", () => {
  it("redirects to the original URL and logs the access", async () => {
    const link = await insertLink("go-code", "https://example.com/target", future());
    const { res, settled } = request("/go-code");
    const response = await res;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.com/target");
    await settled();
    expect(await db.$count(accessLog, eq(accessLog.urlMappingId, link.id))).toBe(1);
  });

  it("redirects to the not-found page for an unknown code", async () => {
    const response = await request("/missing-code").res;
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("http://localhost:3000/not-found");
  });

  it("redirects to the not-found page for an expired code", async () => {
    await insertLink("old-code", "https://example.com", past());
    expect((await request("/old-code").res).headers.get("location")).toBe("http://localhost:3000/not-found");
  });

  it("redirects to the not-found page when the stored URL is unusable", async () => {
    await insertLink("bad-code", "https://example.com", future());
    await db.execute(sql`UPDATE url_mappings SET original_url = 'javascript:alert(1)' WHERE short_code = 'bad-code'`);
    expect((await request("/bad-code").res).headers.get("location")).toBe("http://localhost:3000/not-found");
  });

  it("treats any other single-segment path as a short code, like before", async () => {
    expect((await request("/foo").res).headers.get("location")).toBe("http://localhost:3000/not-found");
  });
});

describe("proxy pass-through", () => {
  it.each(["/", "/not-found", "/analytics", "/analytics/some-code", "/_next-internal", "/a/b"])(
    "lets %s reach the app",
    async (path) => {
      expect(passesThrough(await request(path).res)).toBe(true);
    },
  );
});

describe("proxy matcher", () => {
  it.each(["/", "/some-code", "/not-found", "/analytics/some-code"])("runs on %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(true);
  });

  it.each(["/api/issue", "/_next/static/chunk.js", "/favicon.ico", "/robots.txt"])("skips %s", (url) => {
    expect(unstable_doesMiddlewareMatch({ config, url })).toBe(false);
  });
});
