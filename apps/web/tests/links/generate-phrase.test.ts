import { describe, expect, it } from "vitest";
import { generatePhrase, PATTERN_COUNT, type WordLists } from "@/lib/links/generate-phrase";

const words: WordLists = {
  adjectives: ["golden", "silent", "broken"],
  nouns: ["clock", "butterfly", "mirror"],
  verbs: ["whispers", "melts", "dances"],
  adverbs: ["gently", "slowly"],
};

// One placeholder per word class, so each pattern renders to a fixed string.
const tokens: WordLists = { adjectives: ["ADJ"], nouns: ["NOUN"], verbs: ["VERB"], adverbs: ["ADV"] };

const allWords = new Set(["to", "of", "with", "into", ...Object.values(words).flat()]);

describe("generatePhrase", () => {
  it("returns hyphen-separated words from the lists", () => {
    const phrase = generatePhrase(words);
    expect(phrase).toMatch(/^[a-z]+(-[a-z]+){3,5}$/);
    for (const part of phrase.split("-")) expect(allWords).toContain(part);
  });

  it("returns valid phrases across many calls", () => {
    for (let i = 0; i < 100; i++) {
      expect(generatePhrase(words)).toMatch(/^[a-z]+(-[a-z]+){3,5}$/);
    }
  });

  it("produces different phrases", () => {
    const phrases = new Set(Array.from({ length: 50 }, () => generatePhrase(words)));
    expect(phrases.size).toBeGreaterThan(1);
  });

  it("uses all six patterns", () => {
    expect(PATTERN_COUNT).toBe(6);
    // The first random value picks the pattern; the rest pick words.
    const withPattern = (index: number) => {
      let first = true;
      return () => {
        if (!first) return 0;
        first = false;
        return index / PATTERN_COUNT;
      };
    };
    const rendered = Array.from({ length: PATTERN_COUNT }, (_, i) => generatePhrase(tokens, withPattern(i)));
    expect(rendered).toEqual([
      "ADJ-NOUN-VERB-to-ADJ-NOUN",
      "NOUN-of-ADJ-NOUN-VERB",
      "ADJ-NOUN-VERB-with-ADJ-NOUN",
      "VERB-ADJ-NOUN-into-NOUN",
      "ADJ-NOUN-ADV-VERB",
      "NOUN-ADV-VERB-ADJ-NOUN",
    ]);
  });
});
