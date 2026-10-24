import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { recordClick } from "@/lib/links/record-click";
import { resolveShortCode, toRedirectUrl } from "@/lib/links/resolve-link";
import { resetUrlTables } from "../utils/reset-db";

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

describe("recordClick", () => {
  it("writes an access log row", async () => {
    const link = await insertLink("log-code", "https://example.com", future());
    await recordClick(link.id);
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
