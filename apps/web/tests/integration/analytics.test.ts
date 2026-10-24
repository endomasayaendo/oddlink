import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { accessLog, urlMappings } from "@/db/schema";
import { getAnalytics } from "@/lib/analytics";
import { resetUrlTables } from "./helpers";

resetUrlTables();

const insertLink = () =>
  db
    .insert(urlMappings)
    .values({ shortCode: "stats-code", originalUrl: "https://example.com", accessCount: 3 })
    .returning()
    .then((rows) => rows[0]);

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
    expect((await getAnalytics("stats-code"))?.dailyAccess).toEqual([]);
  });

  it("returns null for an unknown code", async () => {
    expect(await getAnalytics("missing-code")).toBeNull();
  });
});
