import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type ResolvedLink = { id: number; originalUrl: string };

/**
 * Finds an unexpired http(s) link, counts the access and writes its access log row
 * in one statement, so the count and the log can never diverge and concurrent hits
 * never lose increments.
 *
 * The scheme check matches what `new URL()` accepts as http(s) (case-insensitive,
 * `//` optional), so it agrees with `toRedirectUrl` for any value issuing can store.
 */
export async function resolveShortCode(shortCode: string): Promise<ResolvedLink | null> {
  const { rows } = await db.execute<{ id: string; original_url: string }>(sql`
    WITH hit AS (
      UPDATE url_mappings
      SET access_count = access_count + 1
      WHERE short_code = ${shortCode}
        AND (expires_at IS NULL OR expires_at > now())
        AND original_url ~* '^https?:'
      RETURNING id, original_url
    ),
    log AS (
      INSERT INTO access_log (url_mapping_id) SELECT id FROM hit
    )
    SELECT id, original_url FROM hit
  `);
  const row = rows[0];
  return row ? { id: Number(row.id), originalUrl: row.original_url } : null;
}

/** Returns a URL safe to use as a redirect Location, or null if the stored value isn't one. */
export function toRedirectUrl(originalUrl: string): URL | null {
  if (!URL.canParse(originalUrl)) return null;
  const url = new URL(originalUrl);
  return url.protocol === "http:" || url.protocol === "https:" ? url : null;
}
