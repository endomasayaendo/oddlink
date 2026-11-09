import { describe, expect, it } from "vitest";
import { generatePhrase, PATTERN_COUNT, type WordLists } from "@oddlink/utils";
import { db } from "@/lib/db";
import { adjectives, adverbs, nouns, SHORT_CODE_MAX_LENGTH, verbs, WORD_MAX_LENGTH } from "@/lib/db/schema";

const wordsOf = (length: number): WordLists => {
  const list = ["x".repeat(length)];
  return { adjectives: list, nouns: list, verbs: list, adverbs: list };
};

const longestPhrase = (words: WordLists) =>
  Math.max(...Array.from({ length: PATTERN_COUNT }, (_, i) => generatePhrase(words, () => (i + 0.5) / PATTERN_COUNT).length));

class Rollback extends Error {}

// Inserts inside a transaction that is always rolled back, so the seeded word lists stay intact.
const tryInsert = (table: typeof adjectives, word: string) =>
  db
    .transaction(async (tx) => {
      await tx.insert(table).values({ word });
      throw new Rollback();
    })
    .catch((error) => {
      if (!(error instanceof Rollback)) throw error;
    });

describe("WORD_MAX_LENGTH", () => {
  it("is the longest word length for which every pattern fits in short_code", () => {
    expect(WORD_MAX_LENGTH).toBe(49);
    expect(longestPhrase(wordsOf(WORD_MAX_LENGTH))).toBeLessThanOrEqual(SHORT_CODE_MAX_LENGTH);
    expect(longestPhrase(wordsOf(WORD_MAX_LENGTH + 1))).toBeGreaterThan(SHORT_CODE_MAX_LENGTH);
  });
});

describe.each([
  ["adjectives", adjectives],
  ["nouns", nouns],
  ["verbs", verbs],
  ["adverbs", adverbs],
])("%s word length check", (name, table) => {
  it(`accepts a ${WORD_MAX_LENGTH}-character word`, async () => {
    await expect(tryInsert(table, "a".repeat(WORD_MAX_LENGTH))).resolves.toBeUndefined();
  });

  it(`rejects a ${WORD_MAX_LENGTH + 1}-character word`, async () => {
    await expect(tryInsert(table, "a".repeat(WORD_MAX_LENGTH + 1))).rejects.toMatchObject({
      cause: { code: "23514", constraint: `${name}_word_length_check` },
    });
  });
});
