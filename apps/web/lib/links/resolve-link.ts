import { type SQL, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { isActiveLink } from "@/lib/links/link-state";
import { hasUserinfo } from "@/lib/links/url-safety";

export type ResolvedLink = { id: number; originalUrl: string };

/**
 * Finds an active http(s) link (`isActiveLink`: not deleted, disabled or expired), counts the
 * access and writes its access log row in one statement, so the count and the log can never
 * diverge and concurrent hits never lose increments.
 *
 * The SQL scheme check matches what `new URL()` accepts as http(s) (case-insensitive,
 * `//` optional), so it agrees with `toRedirectUrl` for newly issued values. Rows from before
 * a stricter issuing rule (e.g. URLs with userinfo) can still match here and get counted;
 * `toRedirectUrl` is the authoritative gate and decides whether the redirect happens.
 */
export async function resolveShortCode(shortCode: string): Promise<ResolvedLink | null> {
  // original_url is nullable only on a tombstone; isActiveLink excludes deleted rows and the
  // url_unless_deleted CHECK makes it NOT NULL for every other row, so a hit always has one.
  const { rows } = await db.execute<{ id: string; original_url: string }>(redirectStatement(shortCode));
  const row = rows[0];
  return row ? { id: Number(row.id), originalUrl: row.original_url } : null;
}

/**
 * Finds the same link `resolveShortCode` would redirect to, without counting the access or
 * writing a log row. For requests that are not clicks: HEAD, browser prefetches and known bots.
 */
export async function findActiveLink(shortCode: string): Promise<ResolvedLink | null> {
  const { rows } = await db.execute<{ id: string; original_url: string }>(sql`
    SELECT id, original_url FROM url_mappings WHERE ${redirectableLink(shortCode)}
  `);
  const row = rows[0];
  return row ? { id: Number(row.id), originalUrl: row.original_url } : null;
}

/** The rows both lookups may redirect to, so counting and non-counting lookups always agree. */
function redirectableLink(shortCode: string): SQL {
  return sql`short_code = ${shortCode} AND ${isActiveLink} AND original_url ~* '^https?:'`;
}

/**
 * The single redirect statement behind `resolveShortCode`. Exported so tests can run the exact
 * statement inside their own open transaction (link-control's concurrency test).
 */
export function redirectStatement(shortCode: string): SQL {
  return sql`
    WITH hit AS (
      UPDATE url_mappings
      SET access_count = access_count + 1
      WHERE ${redirectableLink(shortCode)}
      RETURNING id, original_url
    ),
    log AS (
      INSERT INTO access_log (url_mapping_id) SELECT id FROM hit
    )
    SELECT id, original_url FROM hit
  `;
}

/** Returns a URL safe to use as a redirect Location, or null if the stored value isn't one. */
export function toRedirectUrl(originalUrl: string): URL | null {
  if (!URL.canParse(originalUrl)) return null;
  const url = new URL(originalUrl);
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  // Rows issued before userinfo was rejected must not redirect to a disguised host.
  return hasUserinfo(url) ? null : url;
}
