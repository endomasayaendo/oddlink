import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { clientKey } from "./client-key";

export type RateLimitVerdict = { allowed: true } | { allowed: false; retryAfterSeconds: number };

type Limit = { max: number; windowSeconds: number };

/**
 * Counts one hit for (scope, key) in a fixed window and says whether it is within `max`.
 *
 * A single upsert, so concurrent hits serialize on the row lock and exactly `max` get through.
 * Windows are aligned to the epoch using the database clock (`now()`), so app servers with skewed
 * clocks agree. The count is capped at max + 1 so a flood cannot overflow the column
 * (LEAST before + 1, so even max = int4 max - 1 never computes int4 max + 1).
 *
 * `now()` is the transaction start time, so a hit that started just before a window boundary can
 * commit after one that started just after it. GREATEST keeps such a late hit from moving the
 * window back and resetting the count; it is counted in the newer window instead.
 */
export async function consumeRateLimit(scope: string, key: string, { max, windowSeconds }: Limit): Promise<RateLimitVerdict> {
  const window = sql`make_interval(secs => ${windowSeconds}::int)`;
  const { rows } = await db.execute<{ count: number; retry_after: number }>(sql`
    INSERT INTO rate_limits (scope, key, window_start, count)
    VALUES (${scope}, ${key}, date_bin(${window}, now(), timestamptz 'epoch'), 1)
    ON CONFLICT (scope, key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start >= EXCLUDED.window_start
          THEN LEAST(rate_limits.count, ${max}::int) + 1
        ELSE 1
      END,
      window_start = GREATEST(rate_limits.window_start, EXCLUDED.window_start)
    RETURNING
      count,
      GREATEST(1, ceil(extract(epoch FROM window_start + ${window} - now())))::int AS retry_after
  `);
  const { count, retry_after } = rows[0];
  return count <= max ? { allowed: true } : { allowed: false, retryAfterSeconds: retry_after };
}

/** Per-client limit on issuing links (API and form share it). */
export async function checkIssueRateLimit(clientIp: string | null): Promise<RateLimitVerdict> {
  const env = getEnv();
  return consumeRateLimit("issue", clientKey(clientIp, env.RATE_LIMIT_SECRET), {
    max: env.ISSUE_RATE_LIMIT_MAX,
    windowSeconds: env.ISSUE_RATE_LIMIT_WINDOW_SECONDS,
  });
}
