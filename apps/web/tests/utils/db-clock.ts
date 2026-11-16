import { sql } from "drizzle-orm";
import { onTestFinished } from "vitest";
import { db } from "@/lib/db";

/** Stops the database clock at `at` until the current test finishes. */
export async function freezeDbClock(at: string | Date) {
  const iso = typeof at === "string" ? at : at.toISOString();
  await db.execute(sql`UPDATE test_clock.state SET frozen_at = ${iso}::timestamptz`);
  onTestFinished(async () => {
    await db.execute(sql`UPDATE test_clock.state SET frozen_at = NULL`);
  });
}
