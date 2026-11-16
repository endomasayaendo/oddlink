import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";

describe("access_log indexes", () => {
  it("has only the primary key and one (url_mapping_id, accessed_at) index", async () => {
    const { rows } = await db.execute<{ name: string; columns: string[] }>(sql`
      SELECT i.relname AS name,
             array_agg(a.attname::text ORDER BY k.ord) AS columns
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      CROSS JOIN LATERAL unnest(x.indkey) WITH ORDINALITY AS k(attnum, ord)
      JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
      WHERE x.indrelid = 'access_log'::regclass
      GROUP BY i.relname
      ORDER BY i.relname
    `);

    expect(rows).toEqual([
      { name: "access_log_pkey", columns: ["id"] },
      { name: "idx_access_log_url_mapping_id_accessed_at", columns: ["url_mapping_id", "accessed_at"] },
    ]);
  });
});
