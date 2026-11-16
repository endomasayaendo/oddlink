import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { rateLimits } from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { freezeDbClock } from "../utils/db-clock";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

// Far longer than a test run, so the count never resets at a window boundary mid-test.
const limit = { max: 3, windowSeconds: 2_000_000_000 };
const hit = (key = "k1", options = limit) => consumeRateLimit("test", key, options);

const minute = { max: 3, windowSeconds: 60 };
const hitMinute = () => consumeRateLimit("test", "k1", minute);
const storedWindow = async () => {
  const [row] = await db.select().from(rateLimits);
  return { windowStart: row.windowStart.toISOString(), count: row.count };
};

describe("consumeRateLimit", () => {
  it("allows up to max hits and rejects the next", async () => {
    for (let i = 0; i < limit.max; i++) expect(await hit()).toEqual({ allowed: true });
    const rejected = await hit();
    expect(rejected.allowed).toBe(false);
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

  it("does not overflow int4 at the largest allowed max", async () => {
    const options = { max: 2_147_483_646, windowSeconds: limit.windowSeconds };
    await hit("big", options);
    await db.execute(sql`UPDATE rate_limits SET count = 2147483647`);
    expect((await hit("big", options)).allowed).toBe(false);
  });

  it("starts a fresh window once the old one has passed", async () => {
    for (let i = 0; i <= limit.max; i++) await hit();
    expect((await hit()).allowed).toBe(false);
    await db.execute(sql`UPDATE rate_limits SET window_start = window_start - interval '1 hour'`);
    expect(await hit()).toEqual({ allowed: true });
    const [row] = await db.select().from(rateLimits);
    expect(row.count).toBe(1);
  });

  it("admits exactly max of many concurrent hits", async () => {
    const options = { max: 5, windowSeconds: limit.windowSeconds };
    const results = await Promise.all(Array.from({ length: 25 }, () => hit("burst", options)));
    expect(results.filter((r) => r.allowed)).toHaveLength(options.max);
  });

  describe("window boundaries, on a frozen database clock", () => {
    it("aligns windows to the epoch", async () => {
      await freezeDbClock("2026-03-01T12:34:56.789Z");
      await hitMinute();
      expect(await storedWindow()).toEqual({ windowStart: "2026-03-01T12:34:00.000Z", count: 1 });

      // 12:34:56Z is 1772368496 s after the epoch, 26 s past a multiple of 90.
      await db.execute(sql`TRUNCATE rate_limits`);
      await consumeRateLimit("test", "k1", { max: 3, windowSeconds: 90 });
      expect(await storedWindow()).toEqual({ windowStart: "2026-03-01T12:34:30.000Z", count: 1 });
    });

    it("gives a Retry-After that counts down to the end of the window", async () => {
      await freezeDbClock("2026-03-01T12:34:00.000Z");
      for (let i = 0; i < minute.max; i++) await hitMinute();
      expect(await hitMinute()).toEqual({ allowed: false, retryAfterSeconds: 60 });

      await freezeDbClock("2026-03-01T12:34:30.500Z");
      expect(await hitMinute()).toEqual({ allowed: false, retryAfterSeconds: 30 });

      await freezeDbClock("2026-03-01T12:34:59.999Z");
      expect(await hitMinute()).toEqual({ allowed: false, retryAfterSeconds: 1 });
    });

    it("resets the count exactly at the next boundary", async () => {
      await freezeDbClock("2026-03-01T12:34:59.999Z");
      for (let i = 0; i < minute.max; i++) await hitMinute();
      expect((await hitMinute()).allowed).toBe(false);

      await freezeDbClock("2026-03-01T12:35:00.000Z");
      expect(await hitMinute()).toEqual({ allowed: true });
      expect(await storedWindow()).toEqual({ windowStart: "2026-03-01T12:35:00.000Z", count: 1 });
    });

    it("counts a hit stamped before the boundary in the newer window it commits after", async () => {
      await freezeDbClock("2026-03-01T12:35:00.000Z");
      await hitMinute();
      await freezeDbClock("2026-03-01T12:34:59.999Z");
      expect(await hitMinute()).toEqual({ allowed: true });
      expect(await storedWindow()).toEqual({ windowStart: "2026-03-01T12:35:00.000Z", count: 2 });
    });
  });
});
