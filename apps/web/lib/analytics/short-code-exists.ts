import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";

/** Whether a link has analytics to show. Expired links still do, like getAnalytics. */
export async function shortCodeExists(shortCode: string): Promise<boolean> {
  return (await db.$count(urlMappings, eq(urlMappings.shortCode, shortCode))) > 0;
}
