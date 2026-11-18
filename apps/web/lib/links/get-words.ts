import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adjectives, adverbs, nouns, verbs } from "@/lib/db/schema";
import type { WordLists } from "@oddlink/utils";

/** How long a loaded word list is served before it is reloaded from the database. */
export const WORDS_TTL_MS = 60_000;

/**
 * Caches the result of `load` for `ttlMs`.
 *
 * - The first call waits for the load; concurrent first calls share it. A failed first load is not
 *   cached, so the next call tries again.
 * - Once the cached value is older than `ttlMs`, the next call starts one background reload and
 *   immediately returns the old value. Calls made while that reload is running also get the old
 *   value and do not start another one.
 * - A failed reload keeps the old value and waits another `ttlMs` before trying again.
 */
export function createTtlCache<T>(load: () => Promise<T>, ttlMs: number, label = "cached value"): () => Promise<T> {
  let value: T | undefined;
  let hasValue = false;
  let loadedAt = 0;
  let inflight: Promise<T> | undefined;

  const start = () => {
    const promise = load().then(
      (loaded) => {
        value = loaded;
        hasValue = true;
        loadedAt = Date.now();
        return loaded;
      },
      (error: unknown) => {
        if (hasValue) loadedAt = Date.now();
        throw error;
      },
    );
    inflight = promise.finally(() => {
      inflight = undefined;
    });
    return inflight;
  };

  return () => {
    if (!hasValue) return inflight ?? start();
    if (!inflight && Date.now() - loadedAt >= ttlMs) {
      start().catch((error: unknown) => {
        console.error(`Failed to reload ${label}; keeping the previous one`, error);
      });
    }
    return Promise.resolve(value as T);
  };
}

export const getWords = createTtlCache(loadWords, WORDS_TTL_MS, "word lists");

async function loadWords(): Promise<WordLists> {
  const load = (table: typeof adjectives) =>
    db
      .select({ word: table.word })
      .from(table)
      .where(eq(table.isActive, true))
      .orderBy(asc(table.id))
      .then((rows) => rows.map((r) => r.word));

  const [adj, noun, verb, adv] = await Promise.all([load(adjectives), load(nouns), load(verbs), load(adverbs)]);
  if (!adj.length || !noun.length || !verb.length || !adv.length) {
    throw new Error("Word lists cannot be empty");
  }
  return { adjectives: adj, nouns: noun, verbs: verb, adverbs: adv };
}
