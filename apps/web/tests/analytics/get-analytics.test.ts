import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { type Analytics, getAnalytics } from "@/lib/analytics/get-analytics";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const insertLink = (values: Partial<typeof urlMappings.$inferInsert> = {}) =>
  db
    .insert(urlMappings)
    .values({ shortCode: "stats-code", originalUrl: "https://example.com", accessCount: 3, ...values })
    .returning()
    .then((rows) => rows[0]);

// Narrows to the variant with stats, failing the test if the link isn't live.
async function liveAnalytics(shortCode: string): Promise<Extract<Analytics, { state: "active" | "expired" }>> {
  const analytics = await getAnalytics(shortCode);
  if (analytics?.state !== "active" && analytics?.state !== "expired") throw new Error(`unexpected ${analytics?.state}`);
  return analytics;
}

describe("getAnalytics", () => {
  it("builds the analytics from the mapping and daily counts", async () => {
    const link = await insertLink();
    await db.insert(accessLog).values([
      // 23:30 UTC on Jan 1 is already Jan 2 in Tokyo.
      { urlMappingId: link.id, accessedAt: new Date("2026-01-01T23:30:00Z") },
      { urlMappingId: link.id, accessedAt: new Date("2026-01-02T01:00:00Z") },
      { urlMappingId: link.id, accessedAt: new Date("2026-01-03T01:00:00Z") },
    ]);

    expect(await getAnalytics("stats-code")).toEqual({
      state: "active",
      shortCode: "stats-code",
      shortUrl: "http://localhost:3000/stats-code",
      originalUrl: "https://example.com",
      totalAccessCount: 3,
      createdAt: link.createdAt,
      expiresAt: null,
      dailyAccess: [
        { date: "2026-01-02", count: 2 },
        { date: "2026-01-03", count: 1 },
      ],
    });
  });

  it("returns an empty daily list when there are no accesses", async () => {
    await insertLink();
    expect((await liveAnalytics("stats-code")).dailyAccess).toEqual([]);
  });

  it("returns null for an unknown code", async () => {
    expect(await getAnalytics("missing-code")).toBeNull();
  });

  it("counts only the accesses of the requested link", async () => {
    const a = await insertLink({ shortCode: "code-a" });
    const b = await insertLink({ shortCode: "code-b" });
    await db.insert(accessLog).values([
      { urlMappingId: a.id, accessedAt: new Date("2026-01-01T01:00:00Z") },
      { urlMappingId: a.id, accessedAt: new Date("2026-01-01T02:00:00Z") },
      { urlMappingId: b.id, accessedAt: new Date("2026-01-01T03:00:00Z") },
      { urlMappingId: b.id, accessedAt: new Date("2026-01-02T03:00:00Z") },
    ]);

    expect((await liveAnalytics("code-a")).dailyAccess).toEqual([{ date: "2026-01-01", count: 2 }]);
    expect((await liveAnalytics("code-b")).dailyAccess).toEqual([
      { date: "2026-01-01", count: 1 },
      { date: "2026-01-02", count: 1 },
    ]);
  });

  it("splits days at midnight in APP_TIME_ZONE and sorts them ascending", async () => {
    const link = await insertLink();
    // Inserted out of order; 15:00 UTC is midnight in Tokyo.
    await db.insert(accessLog).values([
      { urlMappingId: link.id, accessedAt: new Date("2026-01-01T15:00:00Z") },
      { urlMappingId: link.id, accessedAt: new Date("2026-01-01T14:59:59.999Z") },
    ]);

    expect((await liveAnalytics("stats-code")).dailyAccess).toEqual([
      { date: "2026-01-01", count: 1 },
      { date: "2026-01-02", count: 1 },
    ]);
  });

  it("returns a Date for expiresAt, numbers for counts and strings for dates", async () => {
    const link = await insertLink({ expiresAt: new Date("2099-01-01T00:00:00Z") });
    await db.insert(accessLog).values({ urlMappingId: link.id, accessedAt: new Date("2026-01-01T01:00:00Z") });

    const analytics = await liveAnalytics("stats-code");
    expect(analytics?.expiresAt).toBeInstanceOf(Date);
    expect(analytics?.expiresAt?.toISOString()).toBe("2099-01-01T00:00:00.000Z");
    expect(typeof analytics?.totalAccessCount).toBe("number");
    const [entry] = analytics!.dailyAccess;
    expect(typeof entry.count).toBe("number");
    expect(typeof entry.date).toBe("string");
  });

  it("still returns analytics for an expired link", async () => {
    const link = await insertLink({ expiresAt: new Date("2020-01-01T00:00:00Z") });
    await db.insert(accessLog).values({ urlMappingId: link.id, accessedAt: new Date("2019-12-31T01:00:00Z") });

    const analytics = await liveAnalytics("stats-code");
    expect(analytics.state).toBe("expired");
    expect(analytics?.expiresAt).toEqual(new Date("2020-01-01T00:00:00Z"));
    expect(analytics?.dailyAccess).toEqual([{ date: "2019-12-31", count: 1 }]);
  });

  it("hides the destination of a link disabled by the operator or automation, but not by its owner", async () => {
    for (const [code, by] of [["by-operator", "operator"], ["by-automated", "automated"], ["by-owner", "owner"]] as const) {
      await insertLink({ shortCode: code, originalUrl: `https://example.com/${code}` });
      await db.execute(sql`UPDATE url_mappings SET disabled_at = now(), disabled_by = ${by} WHERE short_code = ${code}`);
      expect(await getAnalytics(code)).toMatchObject({
        state: "disabled",
        disabledBy: by,
        originalUrl: by === "owner" ? `https://example.com/${code}` : null,
        totalAccessCount: 3,
      });
    }
  });

  it("returns only the code for a deleted link", async () => {
    await insertLink();
    await db.execute(
      sql`UPDATE url_mappings SET original_url = NULL, access_count = 0, deleted_at = now(), deleted_by = 'operator' WHERE short_code = 'stats-code'`,
    );
    expect(await getAnalytics("stats-code")).toEqual({ state: "deleted", shortCode: "stats-code" });
  });
});
