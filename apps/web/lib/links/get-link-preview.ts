import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";
import { toRedirectUrl } from "@/lib/links/resolve-link";

export type LinkPreview = {
  shortCode: string;
  /** The parsed destination: always http(s) without userinfo, i.e. what a redirect would use. */
  target: URL;
  createdAt: Date;
  expiresAt: Date | null;
  accessCount: number;
  expired: boolean;
};

/**
 * Read-only lookup behind the `+` preview: never counts or logs an access.
 * Returns null when the code is unknown or the stored URL isn't one a redirect would follow
 * (`toRedirectUrl` rejects it), so a preview never shows a destination the link wouldn't go to.
 * Expired links are returned with `expired: true` (computed in SQL, against the same clock the
 * redirect uses) so callers can explain instead of 404.
 *
 * Everything that decides whether a link may be shown (e.g. a future `disabled_at IS NULL`) belongs
 * in this one query.
 */
export async function getLinkPreview(shortCode: string): Promise<LinkPreview | null> {
  const [row] = await db
    .select({
      shortCode: urlMappings.shortCode,
      originalUrl: urlMappings.originalUrl,
      createdAt: urlMappings.createdAt,
      expiresAt: urlMappings.expiresAt,
      accessCount: urlMappings.accessCount,
      expired: sql<boolean>`${urlMappings.expiresAt} IS NOT NULL AND ${urlMappings.expiresAt} <= now()`,
    })
    .from(urlMappings)
    .where(eq(urlMappings.shortCode, shortCode));
  if (!row) return null;

  const target = toRedirectUrl(row.originalUrl);
  if (!target) return null;

  return {
    shortCode: row.shortCode,
    target,
    createdAt: row.createdAt,
    expiresAt: row.expiresAt,
    accessCount: row.accessCount,
    expired: row.expired,
  };
}
