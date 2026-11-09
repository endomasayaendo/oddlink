"use server";

import { rerollShortUrl } from "@/lib/links/reroll-link";

export type RerollState =
  | { ok: true; shortCode: string; shortUrl: string; originalUrl: string }
  | {
      ok: false;
      message: string;
      /** False when trying again cannot help (too late, already rerolled, bad token). */
      canRetry: boolean;
    };

// UI only, on purpose: there is no public reroll API.
export async function rerollAction(token: string): Promise<RerollState> {
  const result = await rerollShortUrl(token);
  if (result.ok) return result;
  return { ok: false, message: result.message, canRetry: result.status === 503 };
}
