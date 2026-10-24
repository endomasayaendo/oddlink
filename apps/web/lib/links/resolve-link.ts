import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export type ResolvedLink = { id: number; originalUrl: string };

/**
 * Finds an unexpired link and counts the access in one atomic statement,
 * so concurrent hits never lose increments.
 */
export async function resolveShortCode(shortCode: string): Promise<ResolvedLink | null> {
  const { rows } = await db.execute<{ id: string; original_url: string }>(sql`
    UPDATE url_mappings
    SET access_count = access_count + 1
    WHERE short_code = ${shortCode}
      AND (expires_at IS NULL OR expires_at > now())
    RETURNING id, original_url
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
