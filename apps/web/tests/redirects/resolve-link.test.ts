import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { resolveShortCode, toRedirectUrl } from "@/lib/links/resolve-link";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const insertLink = (shortCode: string, originalUrl: string, expiresAt: Date | null) =>
  db.insert(urlMappings).values({ shortCode, originalUrl, expiresAt }).returning().then((rows) => rows[0]);

const future = () => new Date(Date.now() + 86_400_000);
const past = () => new Date(Date.now() - 86_400_000);
const countOf = async (shortCode: string) =>
  (await db.query.urlMappings.findFirst({ where: eq(urlMappings.shortCode, shortCode) }))!.accessCount;
const logsOf = (urlMappingId: number) => db.$count(accessLog, eq(accessLog.urlMappingId, urlMappingId));
// Issuing only accepts http(s), so an unusable URL can only get in by editing the row directly.
const corrupt = (shortCode: string, originalUrl: string) =>
  db.execute(sql`UPDATE url_mappings SET original_url = ${originalUrl} WHERE short_code = ${shortCode}`);

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

  it("increments the access count and writes a log row per access", async () => {
    const link = await insertLink("count-code", "https://example.com", future());
    await resolveShortCode("count-code");
    await resolveShortCode("count-code");
    expect(await countOf("count-code")).toBe(2);
    expect(await logsOf(link.id)).toBe(2);
  });

  it("returns the id of the resolved link", async () => {
    const link = await insertLink("id-code", "https://example.com", future());
    expect(await resolveShortCode("id-code")).toEqual({ id: link.id, originalUrl: "https://example.com" });
  });

  it("does not count or log an expired code", async () => {
    const link = await insertLink("old-code", "https://example.com", past());
    await resolveShortCode("old-code");
    expect(await countOf("old-code")).toBe(0);
    expect(await logsOf(link.id)).toBe(0);
  });

  it("does not write a log row for an unknown code", async () => {
    await resolveShortCode("missing-code");
    expect(await db.$count(accessLog)).toBe(0);
  });

  it.each(["javascript:alert(1)", "file:///etc/passwd", "not a url", "ftp://example.com"])(
    "returns null without counting or logging when the stored URL is %s",
    async (originalUrl) => {
      const link = await insertLink("bad-code", "https://example.com", future());
      await corrupt("bad-code", originalUrl);
      expect(await resolveShortCode("bad-code")).toBeNull();
      expect(await countOf("bad-code")).toBe(0);
      expect(await logsOf(link.id)).toBe(0);
    },
  );

  it("accepts an upper-case scheme", async () => {
    await insertLink("upper-code", "https://example.com", future());
    await corrupt("upper-code", "HTTPS://example.com");
    expect(await resolveShortCode("upper-code")).toMatchObject({ originalUrl: "HTTPS://example.com" });
  });

  it("counts and logs concurrent accesses without losing any", async () => {
    const link = await insertLink("busy-code", "https://example.com", future());
    await Promise.all(Array.from({ length: 10 }, () => resolveShortCode("busy-code")));
    expect(await countOf("busy-code")).toBe(10);
    expect(await logsOf(link.id)).toBe(10);
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
