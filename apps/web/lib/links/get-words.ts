import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { adjectives, adverbs, nouns, verbs } from "@/lib/db/schema";
import type { WordLists } from "@oddlink/utils";

// Loaded once per server process; serverless cold starts simply reload it.
let cache: Promise<WordLists> | undefined;

export function getWords(): Promise<WordLists> {
  cache ??= loadWords().catch((error) => {
    cache = undefined;
    throw error;
  });
  return cache;
}

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
