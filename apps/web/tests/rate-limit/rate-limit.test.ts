import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const limit = { max: 3, windowSeconds: 60 };
const hit = (key = "k1", options = limit) => consumeRateLimit("test", key, options);

describe("consumeRateLimit", () => {
  it("allows up to max hits and rejects the next", async () => {
    for (let i = 0; i < limit.max; i++) expect(await hit()).toEqual({ allowed: true });
    const rejected = await hit();
    expect(rejected.allowed).toBe(false);
  });

  it("gives a Retry-After within the window", async () => {
    for (let i = 0; i < limit.max; i++) await hit();
    const rejected = await hit();
    if (rejected.allowed) throw new Error("expected a rejection");
    expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(rejected.retryAfterSeconds).toBeLessThanOrEqual(limit.windowSeconds);
  });

  it("keeps keys and scopes independent", async () => {
    for (let i = 0; i < limit.max; i++) await hit("k1");
    expect((await hit("k1")).allowed).toBe(false);
    expect(await hit("k2")).toEqual({ allowed: true });
    expect(await consumeRateLimit("other", "k1", limit)).toEqual({ allowed: true });
  });

  it("caps the stored count at max + 1", async () => {
    for (let i = 0; i < limit.max + 5; i++) await hit();
    const [row] = await db.select().from(rateLimits);
    expect(row.count).toBe(limit.max + 1);
  });

  it("starts a fresh window once the old one has passed", async () => {
    for (let i = 0; i <= limit.max; i++) await hit();
    expect((await hit()).allowed).toBe(false);
    await db.execute(sql`UPDATE rate_limits SET window_start = window_start - interval '1 hour'`);
    expect(await hit()).toEqual({ allowed: true });
    const [row] = await db.select().from(rateLimits);
    expect(row.count).toBe(1);
  });

  it("aligns windows to the database clock", async () => {
    await hit();
    const { rows } = await db.execute<{ aligned: boolean }>(
      sql`SELECT extract(epoch FROM window_start)::bigint % 60 = 0 AS aligned FROM rate_limits`,
    );
    expect(rows[0].aligned).toBe(true);
  });

  it("admits exactly max of many concurrent hits", async () => {
    const options = { max: 5, windowSeconds: 3600 };
    const results = await Promise.all(Array.from({ length: 25 }, () => hit("burst", options)));
    expect(results.filter((r) => r.allowed)).toHaveLength(options.max);
  });
});
