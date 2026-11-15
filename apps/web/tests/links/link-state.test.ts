import { eq, sql, type SQL } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { getLinkState, isActiveLink, LINK_STATES, linkState } from "@/lib/links/link-state";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const past = () => new Date(Date.now() - 86_400_000);
const future = () => new Date(Date.now() + 86_400_000);

// Every combination the CHECKs allow (a tombstone is never also disabled in practice, but the
// schema allows it, so precedence must still hold).
const fixtures: { name: string; expiresAt: Date | null; set?: SQL; state: (typeof LINK_STATES)[number] }[] = [
  { name: "no-expiry", expiresAt: null, state: "active" },
  { name: "future", expiresAt: future(), state: "active" },
  { name: "expired", expiresAt: past(), state: "expired" },
  ...(["owner", "operator", "automated"] as const).map((by) => ({
    name: `disabled-${by}`,
    expiresAt: future(),
    set: sql`disabled_at = now(), disabled_by = ${by}`,
    state: "disabled" as const,
  })),
  { name: "disabled-expired", expiresAt: past(), set: sql`disabled_at = now(), disabled_by = 'operator'`, state: "disabled" },
  { name: "deleted", expiresAt: future(), set: sql`original_url = NULL, deleted_at = now(), deleted_by = 'operator'`, state: "deleted" },
  { name: "deleted-expired", expiresAt: past(), set: sql`original_url = NULL, deleted_at = now(), deleted_by = 'owner'`, state: "deleted" },
  {
    name: "deleted-disabled",
    expiresAt: future(),
    set: sql`original_url = NULL, deleted_at = now(), deleted_by = 'operator', disabled_at = now(), disabled_by = 'automated'`,
    state: "deleted",
  },
];

async function insertFixtures() {
  for (const f of fixtures) {
    await db.insert(urlMappings).values({ shortCode: f.name, originalUrl: "https://example.com", expiresAt: f.expiresAt });
    if (f.set) await db.execute(sql`UPDATE url_mappings SET ${f.set} WHERE short_code = ${f.name}`);
  }
}

describe("linkState and isActiveLink", () => {
  it("computes the expected state, with precedence deleted > disabled > expired > active", async () => {
    await insertFixtures();
    const rows = await db.select({ code: urlMappings.shortCode, state: linkState }).from(urlMappings);
    expect(Object.fromEntries(rows.map((r) => [r.code, r.state]))).toEqual(Object.fromEntries(fixtures.map((f) => [f.name, f.state])));
    for (const r of rows) expect(LINK_STATES).toContain(r.state);
  });

  it("agrees with linkState = 'active' for every fixture", async () => {
    await insertFixtures();
    const rows = await db
      .select({ code: urlMappings.shortCode, state: linkState, active: sql<boolean>`${isActiveLink}` })
      .from(urlMappings);
    expect(rows).toHaveLength(fixtures.length);
    for (const r of rows) expect({ code: r.code, active: r.active }).toEqual({ code: r.code, active: r.state === "active" });
  });

  it("works in an UPDATE ... WHERE", async () => {
    await insertFixtures();
    await db.execute(sql`UPDATE url_mappings SET access_count = 1 WHERE ${isActiveLink}`);
    const counted = await db.select({ code: urlMappings.shortCode }).from(urlMappings).where(eq(urlMappings.accessCount, 1));
    expect(counted.map((r) => r.code).sort()).toEqual(["future", "no-expiry"]);
  });
});

describe("getLinkState", () => {
  it("returns null for an unknown code", async () => {
    expect(await getLinkState("missing-code")).toBeNull();
  });

  it("returns the state and, for disabled and deleted links, who acted", async () => {
    await insertFixtures();
    expect(await getLinkState("no-expiry")).toEqual({ state: "active" });
    expect(await getLinkState("expired")).toEqual({ state: "expired" });
    expect(await getLinkState("disabled-automated")).toEqual({ state: "disabled", by: "automated" });
    expect(await getLinkState("disabled-expired")).toEqual({ state: "disabled", by: "operator" });
    expect(await getLinkState("deleted-expired")).toEqual({ state: "deleted", by: "owner" });
    expect(await getLinkState("deleted-disabled")).toEqual({ state: "deleted", by: "operator" });
  });

  it("treats a row inserted without the new columns (like every pre-migration row) as active", async () => {
    await db.execute(sql`INSERT INTO url_mappings (short_code, original_url) VALUES ('legacy', 'https://example.com')`);
    expect(await getLinkState("legacy")).toEqual({ state: "active" });
  });
});

describe("url_mappings CHECK constraints", () => {
  const insert = (columns: SQL) => db.execute(sql`INSERT INTO url_mappings (short_code, ${columns}`);

  it.each([
    ["disabled_at without disabled_by", "disabled_pair", sql`original_url, disabled_at) VALUES ('x', 'https://e.com', now())`],
    ["disabled_by without disabled_at", "disabled_pair", sql`original_url, disabled_by) VALUES ('x', 'https://e.com', 'operator')`],
    ["deleted_at without deleted_by", "deleted_pair", sql`deleted_at) VALUES ('x', now())`],
    ["deleted_by without deleted_at", "deleted_pair", sql`original_url, deleted_by) VALUES ('x', 'https://e.com', 'operator')`],
    ["a tombstone that keeps its URL", "tombstone_is_empty", sql`original_url, deleted_at, deleted_by) VALUES ('x', 'https://e.com', now(), 'operator')`],
    ["a live link without a URL", "url_unless_deleted", sql`original_url) VALUES ('x', NULL)`],
    ["a delete by automation", "deleted_by_not_automated", sql`deleted_at, deleted_by) VALUES ('x', now(), 'automated')`],
  ])("rejects %s", async (_, constraint, columns) => {
    await expect(insert(columns)).rejects.toMatchObject({ cause: { code: "23514", constraint } });
  });

  it("accepts a well-formed tombstone", async () => {
    await insert(sql`deleted_at, deleted_by) VALUES ('x', now(), 'owner')`);
    expect(await getLinkState("x")).toEqual({ state: "deleted", by: "owner" });
  });

  it("refuses to DELETE a link that still has access_log rows", async () => {
    const [link] = await db.insert(urlMappings).values({ shortCode: "logged", originalUrl: "https://e.com" }).returning();
    await db.insert(accessLog).values({ urlMappingId: link.id });
    await expect(db.execute(sql`DELETE FROM url_mappings WHERE id = ${link.id}`)).rejects.toMatchObject({
      cause: { code: "23503" },
    });
  });
});
