import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { SHORT_CODE_MAX_LENGTH, urlMappings } from "@/lib/db/schema";
import { shortUrlFor } from "@/lib/constants";
import { generatePhrase } from "@oddlink/utils";
import { originalUrlSchema } from "@/lib/zod/schemas/links";
import { getWords } from "./get-words";
import { checkUrlSafety, type SafetyVerdict } from "./safe-browsing";
import { UNSAFE_URL_MESSAGE } from "./safe-browsing/advisory";
import { checkIssueRateLimit, type RateLimitVerdict } from "@/lib/rate-limit";

const MAX_ATTEMPTS = 5;

export const RATE_LIMITED_MESSAGE = "You're creating links too quickly. Please try again in a few minutes.";

export type IssueResult =
  | { ok: true; shortCode: string; shortUrl: string; originalUrl: string }
  | { ok: false; status: 400 | 503; reason?: never; message: string }
  | { ok: false; status: 422; reason: "unsafe_url"; message: string }
  | { ok: false; status: 429; reason: "rate_limited"; message: string; retryAfterSeconds: number };

type Options = {
  /** Normalized client address from lib/rate-limit/client-key; null shares the "unknown" bucket. */
  clientIp?: string | null;
  /** Per-client limit; a failing limiter lets the request through (fail open). */
  rateLimit?: (clientIp: string | null) => Promise<RateLimitVerdict>;
  generate?: () => Promise<string>;
  /** Threat-list lookup; "unknown" (lookup failed or skipped) issues the link anyway. */
  checkUrl?: (url: string) => Promise<SafetyVerdict>;
};

const defaultGenerate = async () => generatePhrase(await getWords());

/**
 * Validates the URL, applies the per-client rate limit (invalid input is not counted; unsafe URLs are),
 * refuses ones Google Safe Browsing flags (failing open when it can't tell),
 * and stores it under a fresh phrase, regenerating on collisions and on phrases too long for the short_code column. Both share MAX_ATTEMPTS.
 */
export async function issueShortUrl(
  input: unknown,
  { clientIp = null, rateLimit = checkIssueRateLimit, generate = defaultGenerate, checkUrl = checkUrlSafety }: Options = {},
): Promise<IssueResult> {
  const parsed = originalUrlSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, status: 400, message: parsed.error.issues[0].message };
  }
  const originalUrl = parsed.data;

  // try/await rather than .catch(): a limiter that throws synchronously must fail open too.
  let limit: RateLimitVerdict;
  try {
    limit = await rateLimit(clientIp);
  } catch (error) {
    // Code only: the error could carry connection details, and the key must not be logged.
    console.warn("[rate-limit] check failed; allowing the request", { code: errorCode(error) ?? "unknown" });
    limit = { allowed: true };
  }
  if (!limit.allowed) {
    return {
      ok: false,
      status: 429,
      reason: "rate_limited",
      message: RATE_LIMITED_MESSAGE,
      retryAfterSeconds: limit.retryAfterSeconds,
    };
  }

  const verdict = await checkUrl(originalUrl).catch(() => "unknown" as const);
  if (verdict === "unsafe") {
    return { ok: false, status: 422, reason: "unsafe_url", message: UNSAFE_URL_MESSAGE };
  }

  let tooLong = 0;
  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const shortCode = await generate();
      // Would fail with 22001 (value too long). Count code points, as varchar(n) does.
      const length = [...shortCode].length;
      if (length > SHORT_CODE_MAX_LENGTH) {
        tooLong++;
        console.warn(`Generated phrase is ${length} characters (max ${SHORT_CODE_MAX_LENGTH}); check the word lists for long words`);
        continue;
      }
      try {
        await db.insert(urlMappings).values({
          shortCode,
          originalUrl,
          expiresAt: sql`now() + interval '1 year'`,
        });
        return { ok: true, shortCode, shortUrl: shortUrlFor(shortCode), originalUrl };
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
      }
    }
    console.warn(
      `Failed to issue a short code after ${MAX_ATTEMPTS} attempts (${MAX_ATTEMPTS - tooLong} collisions, ${tooLong} too long)`,
    );
  } catch (error) {
    console.error("Failed to issue short URL", error);
  }
  return { ok: false, status: 503, message: "Service temporarily unavailable" };
}

// Drizzle wraps driver errors, so the Postgres code may sit on `cause`.
function errorCode(error: unknown): string | undefined {
  const code = (e: unknown) => (e as { code?: unknown } | undefined)?.code;
  const value = code(error) ?? code((error as { cause?: unknown } | undefined)?.cause);
  return typeof value === "string" ? value : undefined;
}

function isUniqueViolation(error: unknown): boolean {
  return errorCode(error) === "23505";
}
