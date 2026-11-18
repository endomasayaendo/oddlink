import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { getLinkPreview, type LinkPreview } from "@/lib/links/get-link-preview";
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

// Narrows to the variant with a destination, failing the test if the link isn't live.
async function livePreview(shortCode: string): Promise<Extract<LinkPreview, { state: "active" | "expired" }>> {
  const preview = await getLinkPreview(shortCode);
  if (preview?.state !== "active" && preview?.state !== "expired") throw new Error(`unexpected ${preview?.state}`);
  return preview;
}

describe("getLinkPreview", () => {
  it("returns the fields the preview shows", async () => {
    const link = await insertLink({ accessCount: 7, expiresAt: new Date("2099-01-01T00:00:00Z") });
    const preview = await getLinkPreview("peek-code");
    expect(preview).toEqual({
      state: "active",
      shortCode: "peek-code",
      target: new URL("https://example.com/target?q=1"),
      createdAt: link.createdAt,
      expiresAt: new Date("2099-01-01T00:00:00Z"),
      accessCount: 7,
    });
    const live = await livePreview("peek-code");
    expect(live.target).toBeInstanceOf(URL);
    expect(typeof live.accessCount).toBe("number");
  });

  it("is not expired without an expiry date", async () => {
    await insertLink();
    expect(await getLinkPreview("peek-code")).toMatchObject({ expiresAt: null, state: "active" });
  });

  it("flags an expired link instead of hiding it", async () => {
    await insertLink({ expiresAt: new Date(Date.now() - 86_400_000) });
    expect(await getLinkPreview("peek-code")).toMatchObject({ state: "expired" });
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
    expect((await livePreview("peek-code")).target.host).toBe("xn--mnchen-3ya.example");
  });

  it("neither counts nor logs an access", async () => {
    const link = await insertLink({ accessCount: 3 });
    await getLinkPreview("peek-code");
    await getLinkPreview("peek-code");
    const row = await db.query.urlMappings.findFirst({ where: eq(urlMappings.shortCode, "peek-code") });
    expect(row?.accessCount).toBe(3);
    expect(await db.$count(accessLog, eq(accessLog.urlMappingId, link.id))).toBe(0);
  });

  it.each(["operator", "automated", "owner"] as const)("returns no destination for a link disabled by %s", async (by) => {
    await insertLink({ expiresAt: new Date(Date.now() - 86_400_000) });
    await db.execute(sql`UPDATE url_mappings SET disabled_at = now(), disabled_by = ${by} WHERE short_code = 'peek-code'`);
    expect(await getLinkPreview("peek-code")).toEqual({ state: "disabled", by, shortCode: "peek-code" });
  });

  it("returns no destination for a deleted link", async () => {
    await insertLink();
    await db.execute(
      sql`UPDATE url_mappings SET original_url = NULL, deleted_at = now(), deleted_by = 'owner' WHERE short_code = 'peek-code'`,
    );
    expect(await getLinkPreview("peek-code")).toEqual({ state: "deleted", by: "owner", shortCode: "peek-code" });
  });
});
