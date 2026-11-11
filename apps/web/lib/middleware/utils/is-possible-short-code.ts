import { SHORT_CODE_MAX_LENGTH } from "@/lib/db/schema";

/**
 * Cheap shape check run before any DB lookup: false means the key can never be a short code.
 * A deny-list on purpose, so future non-ASCII words and existing codes like `café-code` stay valid.
 * Each rule is safe because phrases are words joined by `-` and seed words are `[a-z]+`:
 * - empty: no code is empty (also what `parse` returns for an undecodable segment);
 * - over SHORT_CODE_MAX_LENGTH code points: can't fit the column, counted like issue-link.ts does;
 * - control characters (C0, DEL, C1): never in a word, and Postgres rejects NUL outright;
 * - `.`: never in a phrase, and it filters file-like paths bots probe (`/robots.txt`);
 * - `+`: never in a phrase, and reserved as the preview suffix (`/code+`), so `/code++` and
 *   `/analytics/code+` are impossible keys instead of lookups.
 */
export function isPossibleShortCode(key: string): boolean {
  if (!key) return false;
  // `length` counts UTF-16 units, so it is only an upper bound for code points: skip the spread when it's short.
  if (key.length > SHORT_CODE_MAX_LENGTH && [...key].length > SHORT_CODE_MAX_LENGTH) return false;
  return !/[\p{Cc}.+]/u.test(key);
}
