import { sql } from "drizzle-orm";
import { beforeEach } from "vitest";
import { db } from "@/db";

export function resetUrlTables() {
  beforeEach(async () => {
    await db.execute(sql`TRUNCATE url_mappings, access_log RESTART IDENTITY CASCADE`);
  });
}
