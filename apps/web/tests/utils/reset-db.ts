import { sql } from "drizzle-orm";
import { beforeAll, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { assertTestDatabaseName } from "./test-database";

// Checks the database the app's `db` client is actually connected to, not just the configured URL.
export async function assertConnectedToTestDatabase() {
  const { rows } = await db.execute<{ name: string }>(sql`SELECT current_database() AS name`);
  assertTestDatabaseName(rows[0].name);
}

export function resetUrlTables() {
  beforeAll(assertConnectedToTestDatabase);
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE url_mappings, access_log, rate_limits RESTART IDENTITY CASCADE`);
  });
}
