import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";
import { SHORT_CODE_MAX_LENGTH, shortUrlFor } from "@/lib/constants";
import { generatePhrase } from "@oddlink/utils";
import { originalUrlSchema } from "@/lib/zod/schemas/links";
import { getWords } from "./get-words";

const MAX_ATTEMPTS = 5;

export type IssueResult =
  | { ok: true; shortCode: string; shortUrl: string; originalUrl: string }
  | { ok: false; status: 400 | 503; message: string };

type Options = { generate?: () => Promise<string> };

const defaultGenerate = async () => generatePhrase(await getWords());

/**
 * Validates the URL and stores it under a fresh phrase, regenerating on collisions
 * and on phrases too long for the short_code column. Both share MAX_ATTEMPTS.
 */
export async function issueShortUrl(input: unknown, { generate = defaultGenerate }: Options = {}): Promise<IssueResult> {
  const parsed = originalUrlSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, status: 400, message: parsed.error.issues[0].message };
  }
  const originalUrl = parsed.data;

  try {
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const shortCode = await generate();
      // Would fail with 22001 (value too long); long words make this possible, so just try again.
      if (shortCode.length > SHORT_CODE_MAX_LENGTH) continue;
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
    console.warn(`Failed to generate a unique phrase that fits after ${MAX_ATTEMPTS} attempts`);
  } catch (error) {
    console.error("Failed to issue short URL", error);
  }
  return { ok: false, status: 503, message: "Service temporarily unavailable" };
}

// Drizzle wraps driver errors, so the Postgres code may sit on `cause`.
function isUniqueViolation(error: unknown): boolean {
  const code = (e: unknown) => (e as { code?: string } | undefined)?.code;
  return code(error) === "23505" || code((error as { cause?: unknown })?.cause) === "23505";
}
