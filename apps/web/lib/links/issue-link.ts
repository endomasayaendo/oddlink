import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";
import { shortUrlFor } from "@/lib/constants";
import { originalUrlSchema } from "@/lib/zod/schemas/links";
import { type GeneratePhrase, withFreshPhrase } from "./fresh-phrase";

export type IssueResult =
  | { ok: true; id: number; shortCode: string; shortUrl: string; originalUrl: string }
  | { ok: false; status: 400 | 503; message: string };

type Options = { generate?: GeneratePhrase };

/**
 * Validates the URL and stores it under a fresh phrase, regenerating on collisions
 * and on phrases too long for the short_code column (see withFreshPhrase).
 */
export async function issueShortUrl(input: unknown, { generate }: Options = {}): Promise<IssueResult> {
  const parsed = originalUrlSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, status: 400, message: parsed.error.issues[0].message };
  }
  const originalUrl = parsed.data;

  const issued = await withFreshPhrase(
    async (shortCode) => {
      const [row] = await db
        .insert(urlMappings)
        .values({ shortCode, originalUrl, expiresAt: sql`now() + interval '1 year'` })
        .returning({ id: urlMappings.id });
      return { id: row.id, shortCode };
    },
    { generate, label: "issue a short code" },
  );
  if (!issued) return { ok: false, status: 503, message: "Service temporarily unavailable" };

  const { id, shortCode } = issued.value;
  return { ok: true, id, shortCode, shortUrl: shortUrlFor(shortCode), originalUrl };
}
