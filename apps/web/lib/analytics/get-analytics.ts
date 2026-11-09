import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accessLog, urlMappings } from "@/lib/db/schema";
import { APP_TIME_ZONE, shortUrlFor } from "@/lib/constants";

export type DailyAccess = { date: string; count: number };

export type Analytics = {
  shortCode: string;
  shortUrl: string;
  originalUrl: string;
  totalAccessCount: number;
  createdAt: Date;
  expiresAt: Date | null;
  dailyAccess: DailyAccess[];
};

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

  // Separate pool connections, so not one snapshot; an in-flight access may show in one but not the other.
  const [mapping, dailyAccess] = await Promise.all([
    db.query.urlMappings.findFirst({ where: eq(urlMappings.shortCode, shortCode) }),
    dailyQuery,
  ]);
  if (!mapping) return null;

  return {
    shortCode: mapping.shortCode,
    shortUrl: shortUrlFor(mapping.shortCode),
    originalUrl: mapping.originalUrl,
    totalAccessCount: mapping.accessCount,
    createdAt: mapping.createdAt,
    expiresAt: mapping.expiresAt,
    dailyAccess,
  };
}
