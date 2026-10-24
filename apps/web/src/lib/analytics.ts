import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { accessLog, urlMappings } from "@/db/schema";
import { APP_TIME_ZONE, shortUrlFor } from "./config";

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
  const mapping = await db.query.urlMappings.findFirst({ where: eq(urlMappings.shortCode, shortCode) });
  if (!mapping) return null;

  // Days are counted in APP_TIME_ZONE rather than the database server's zone.
  const day = sql<string>`to_char((${accessLog.accessedAt} AT TIME ZONE ${APP_TIME_ZONE})::date, 'YYYY-MM-DD')`;
  const dailyAccess = await db
    .select({ date: day, count: sql<number>`count(*)::int` })
    .from(accessLog)
    .where(eq(accessLog.urlMappingId, mapping.id))
    // By position: the time zone is bound as a separate parameter in each clause,
    // so Postgres wouldn't treat repeated expressions as the same.
    .groupBy(sql`1`)
    .orderBy(sql`1`);

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
