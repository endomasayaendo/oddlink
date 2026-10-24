import { db } from "@/lib/db";
import { accessLog } from "@/lib/db/schema";

export async function recordClick(urlMappingId: number): Promise<void> {
  await db.insert(accessLog).values({ urlMappingId });
}
