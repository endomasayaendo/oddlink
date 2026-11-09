import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { getLinkPreview } from "@/lib/links/get-link-preview";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const insertLink = (values: Partial<typeof urlMappings.$inferInsert> = {}) =>
  db
    .insert(urlMappings)
    .values({ shortCode: "peek-code", originalUrl: "https://example.com/target?q=1", ...values })
    .returning()
    .then((rows) => rows[0]);
const corrupt = (shortCode: string, originalUrl: string) =>
  db.execute(sql`UPDATE url_mappings SET original_url = ${originalUrl} WHERE short_code = ${shortCode}`);

describe("getLinkPreview", () => {
  it("returns the fields the preview shows", async () => {
    const link = await insertLink({ accessCount: 7, expiresAt: new Date("2099-01-01T00:00:00Z") });
    const preview = await getLinkPreview("peek-code");
    expect(preview).toEqual({
      shortCode: "peek-code",
      target: new URL("https://example.com/target?q=1"),
      createdAt: link.createdAt,
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      accessCount: 7,
      expired: false,
    });
    expect(preview?.target).toBeInstanceOf(URL);
    expect(typeof preview?.accessCount).toBe("number");
  });

  it("is not expired without an expiry date", async () => {
    await insertLink();
    expect(await getLinkPreview("peek-code")).toMatchObject({ expiresAt: null, expired: false });
  });

  it("flags an expired link instead of hiding it", async () => {
    await insertLink({ expiresAt: new Date(Date.now() - 1000) });
    expect(await getLinkPreview("peek-code")).toMatchObject({ expired: true });
  });

  it("returns null for an unknown code", async () => {
    expect(await getLinkPreview("missing-code")).toBeNull();
  });

  it.each([
    ["a javascript: URL", "javascript:alert(1)"],
    ["a URL with userinfo", "https://google.com@evil.example"],
    ["an unparsable value", "not a url"],
  ])("returns null when the stored value is %s", async (_, value) => {
    await insertLink();
    await corrupt("peek-code", value);
    expect(await getLinkPreview("peek-code")).toBeNull();
  });

  it("keeps an internationalized host in punycode", async () => {
    await insertLink({ originalUrl: "https://münchen.example/" });
    expect((await getLinkPreview("peek-code"))?.target.host).toBe("xn--mnchen-3ya.example");
  });

  it("neither counts nor logs an access", async () => {
    const link = await insertLink({ accessCount: 3 });
    await getLinkPreview("peek-code");
    await getLinkPreview("peek-code");
    const row = await db.query.urlMappings.findFirst({ where: eq(urlMappings.shortCode, "peek-code") });
    expect(row?.accessCount).toBe(3);
    expect(await db.$count(accessLog, eq(accessLog.urlMappingId, link.id))).toBe(0);
  });
});
