import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

export const PING_TIMEOUT_MS = 2_500;

/**
 * Runs `SELECT 1` and rejects if it fails or takes longer than `timeoutMs` (connecting included).
 * On timeout the query itself is left to finish or hit the pool's own connection and statement
 * timeouts, so its client is always released back to the pool.
 */
export async function pingDatabase(timeoutMs = PING_TIMEOUT_MS): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Database ping timed out after ${timeoutMs} ms`)), timeoutMs);
  });
  // Drizzle's query object runs the query again on every `then`, so it is turned into a single
  // promise once and every handler below attaches to that.
  const query = db.execute(sql`SELECT 1`).then(() => undefined);
  // A late rejection after the timeout won must not surface as an unhandled rejection.
  query.catch(() => {});
  try {
    await Promise.race([query, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
