import { eq, sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { accessLog, urlMappings } from "@/db/schema";
import { recordAccess, resolveShortCode, toRedirectUrl } from "@/lib/redirect";
import { resetUrlTables } from "./helpers";

const pending: Promise<unknown>[] = [];
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => Promise<unknown>) => pending.push(task()),
}));

const { GET } = await import("@/app/[shortCode]/route");

resetUrlTables();

const insertLink = (shortCode: string, originalUrl: string, expiresAt: Date | null) =>
  db.insert(urlMappings).values({ shortCode, originalUrl, expiresAt }).returning().then((rows) => rows[0]);

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);
const countOf = async (shortCode: string) =>
  (await db.query.urlMappings.findFirst({ where: eq(urlMappings.shortCode, shortCode) }))!.accessCount;

describe("resolveShortCode", () => {
  it("returns the original URL for a valid code", async () => {
    await insertLink("valid-code", "https://example.com", future());
    expect(await resolveShortCode("valid-code")).toMatchObject({ originalUrl: "https://example.com" });
  });

  it("returns null for an unknown code", async () => {
    expect(await resolveShortCode("missing-code")).toBeNull();
  });

  it("returns null for an expired code", async () => {
    await insertLink("old-code", "https://example.com", past());
    expect(await resolveShortCode("old-code")).toBeNull();
  });

  it("treats a missing expiry as never expiring", async () => {
    await insertLink("forever-code", "https://example.com", null);
    expect(await resolveShortCode("forever-code")).not.toBeNull();
  });

  it("increments the access count", async () => {
    await insertLink("count-code", "https://example.com", future());
    await resolveShortCode("count-code");
    await resolveShortCode("count-code");
    expect(await countOf("count-code")).toBe(2);
  });

  it("does not increment the count of an expired code", async () => {
    await insertLink("old-code", "https://example.com", past());
    await resolveShortCode("old-code");
    expect(await countOf("old-code")).toBe(0);
  });

  it("counts concurrent accesses without losing updates", async () => {
    await insertLink("busy-code", "https://example.com", future());
    await Promise.all(Array.from({ length: 10 }, () => resolveShortCode("busy-code")));
    expect(await countOf("busy-code")).toBe(10);
  });
});

describe("recordAccess", () => {
  it("writes an access log row", async () => {
    const link = await insertLink("log-code", "https://example.com", future());
    await recordAccess(link.id);
    expect(await db.$count(accessLog, eq(accessLog.urlMappingId, link.id))).toBe(1);
  });
});

describe("toRedirectUrl", () => {
  it("accepts http(s) URLs", () => {
    expect(toRedirectUrl("https://example.com/a b")?.href).toBe("https://example.com/a%20b");
  });

  it.each(["not a url", "javascript:alert(1)", "file:///etc/passwd"])("rejects %s", (value) => {
    expect(toRedirectUrl(value)).toBeNull();
  });
});

describe("GET /[shortCode]", () => {
  const get = (shortCode: string) =>
    GET(new Request(`http://localhost:3000/${shortCode}`), { params: Promise.resolve({ shortCode }) });

  it("redirects to the original URL and logs the access", async () => {
    const link = await insertLink("go-code", "https://example.com/target", future());
    const res = await get("go-code");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://example.com/target");
    await Promise.all(pending.splice(0));
    expect(await db.$count(accessLog, eq(accessLog.urlMappingId, link.id))).toBe(1);
  });

  it("redirects to the not-found page for an unknown code", async () => {
    const res = await get("missing-code");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/not-found");
  });

  it("redirects to the not-found page for an expired code", async () => {
    await insertLink("old-code", "https://example.com", past());
    expect((await get("old-code")).headers.get("location")).toBe("http://localhost:3000/not-found");
  });

  it("redirects to the not-found page when the stored URL is unusable", async () => {
    await insertLink("bad-code", "https://example.com", future());
    await db.execute(sql`UPDATE url_mappings SET original_url = 'javascript:alert(1)' WHERE short_code = 'bad-code'`);
    expect((await get("bad-code")).headers.get("location")).toBe("http://localhost:3000/not-found");
  });
});
