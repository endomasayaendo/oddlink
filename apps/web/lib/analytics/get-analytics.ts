import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { APP_TIME_ZONE, shortUrlFor } from "@/lib/constants";
import { type LinkActor, linkState, toLinkStatus } from "@/lib/links/link-state";
import { toRedirectUrl } from "@/lib/links/resolve-link";

export type DailyAccess = { date: string; count: number };

type AnalyticsStats = {
  shortCode: string;
  shortUrl: string;
  totalAccessCount: number;
  createdAt: Date;
  expiresAt: Date | null;
  dailyAccess: DailyAccess[];
};

/**
 * `originalUrl` is the stored destination as text. `originalHref` is the URL a redirect would use
 * (`toRedirectUrl`), or null when the redirect would refuse the stored value or there is no
 * destination to show; only `originalHref` may be rendered as a link.
 */
type Destination<Url extends string | null> = { originalUrl: Url; originalHref: string | null };

export type Analytics =
  | ({ state: "active" | "expired" } & Destination<string> & AnalyticsStats)
  // The analytics page is public, so the destination is kept only when the owner disabled the link.
  | ({ state: "disabled"; disabledBy: LinkActor } & Destination<string | null> & AnalyticsStats)
  // A tombstone has no data left to show.
  | { state: "deleted"; shortCode: string };

export async function getAnalytics(shortCode: string): Promise<Analytics | null> {
  // Days are counted in APP_TIME_ZONE rather than the database server's zone.
  const day = sql<string>`to_char((${accessLog.accessedAt} AT TIME ZONE ${APP_TIME_ZONE})::date, 'YYYY-MM-DD')`;
  const dailyQuery = db
    .select({ date: day, count: sql<number>`count(*)::int` })
    .from(accessLog)
    // Filter by short code (not mapping.id) so this can run alongside the mapping lookup.
    .innerJoin(urlMappings, eq(accessLog.urlMappingId, urlMappings.id))
    .where(eq(urlMappings.shortCode, shortCode))
    // By position: the time zone is bound as a separate parameter in each clause,
    // so Postgres wouldn't treat repeated expressions as the same.
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  const mappingQuery = db
    .select({
      state: linkState,
      disabledBy: urlMappings.disabledBy,
      deletedBy: urlMappings.deletedBy,
      shortCode: urlMappings.shortCode,
      originalUrl: urlMappings.originalUrl,
      accessCount: urlMappings.accessCount,
      createdAt: urlMappings.createdAt,
      expiresAt: urlMappings.expiresAt,
    })
    .from(urlMappings)
    .where(eq(urlMappings.shortCode, shortCode));

  // Separate pool connections, so not one snapshot; an in-flight access may show in one but not the other.
  const [[mapping], dailyAccess] = await Promise.all([mappingQuery, dailyQuery]);
  if (!mapping) return null;

  const status = toLinkStatus(mapping.state, mapping.disabledBy, mapping.deletedBy);
  if (status.state === "deleted") return { state: "deleted", shortCode: mapping.shortCode };

  const stats: AnalyticsStats = {
    shortCode: mapping.shortCode,
    shortUrl: shortUrlFor(mapping.shortCode),
    totalAccessCount: mapping.accessCount,
    createdAt: mapping.createdAt,
    expiresAt: mapping.expiresAt,
    dailyAccess,
  };
  if (status.state === "disabled") {
    const originalUrl = status.by === "owner" ? mapping.originalUrl : null;
    return { state: "disabled", disabledBy: status.by, ...destination(originalUrl), ...stats };
  }
  // Not deleted, so the url_unless_deleted CHECK guarantees a URL.
  if (mapping.originalUrl === null) throw new Error(`Link ${mapping.shortCode} has no URL but is not deleted`);
  return { state: status.state, ...destination(mapping.originalUrl), ...stats };
}

function destination<Url extends string | null>(originalUrl: Url): Destination<Url> {
  const originalHref = originalUrl === null ? null : (toRedirectUrl(originalUrl)?.href ?? null);
  return { originalUrl, originalHref };
}
