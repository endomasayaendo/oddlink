import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";
import { shortUrlFor } from "@/lib/constants";
import { COLLISION, type GeneratePhrase, withFreshPhrase } from "./fresh-phrase";
import { verifyRerollToken } from "./reroll-token";

export type RerollResult =
  | { ok: true; shortCode: string; shortUrl: string; originalUrl: string }
  | { ok: false; status: 400 | 409 | 410 | 503; message: string };

type Options = {
  generate?: GeneratePhrase;
  /** Epoch milliseconds; injectable for tests. */
  now?: () => number;
};

/**
 * Gives the link a new phrase in place (same row, so clicks and the access log carry over).
 * The old phrase stops resolving at once. The token is single-use in effect: the UPDATE only
 * matches while the row still has the phrase the token was signed for.
 */
export async function rerollShortUrl(token: unknown, { generate, now }: Options = {}): Promise<RerollResult> {
  const verified = verifyRerollToken(token, { now });
  if (!verified.ok) {
    return verified.reason === "expired"
      ? { ok: false, status: 410, message: "Too late to reroll" }
      : { ok: false, status: 400, message: "Invalid reroll request" };
  }
  const { id, code } = verified.claims;

  const rerolled = await withFreshPhrase(
    async (shortCode) => {
      // Same phrase again would "succeed" without changing anything.
      if (shortCode === code) return COLLISION;
      const [row] = await db
        .update(urlMappings)
        .set({ shortCode })
        .where(and(eq(urlMappings.id, id), eq(urlMappings.shortCode, code)))
        .returning({ originalUrl: urlMappings.originalUrl });
      return row ? { shortCode, originalUrl: row.originalUrl } : null;
    },
    { generate, label: "reroll a short code" },
  );
  if (!rerolled) return { ok: false, status: 503, message: "Service temporarily unavailable" };
  // No row: already rerolled with this token, or the link is gone.
  if (!rerolled.value) return { ok: false, status: 409, message: "Already rerolled" };

  const { shortCode, originalUrl } = rerolled.value;
  return { ok: true, shortCode, shortUrl: shortUrlFor(shortCode), originalUrl };
}
