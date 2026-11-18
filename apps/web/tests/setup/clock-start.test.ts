import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

const start = process.env.TEST_CLOCK_START;

describe.runIf(start)("TEST_CLOCK_START", () => {
  it("starts the JS and database clocks at the given instant", async () => {
    const startMs = Date.parse(start!);
    const { rows } = await db.execute<{ ms: string }>(sql`SELECT floor(extract(epoch FROM now()) * 1000)::bigint AS ms`);
    expect(Date.now() - startMs).toBeGreaterThanOrEqual(0);
    expect(Date.now() - startMs).toBeLessThan(1_000);
    expect(Number(rows[0].ms) - startMs).toBeGreaterThanOrEqual(0);
    expect(Number(rows[0].ms) - startMs).toBeLessThan(1_000);
  });
});
