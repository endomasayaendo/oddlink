export type WordLists = {
  adjectives: readonly string[];
  nouns: readonly string[];
  verbs: readonly string[];
  adverbs: readonly string[];
};

type Random = () => number;
type Pick = (list: readonly string[]) => string;

// The six phrase patterns, e.g. golden-clock-whispers-to-silent-butterfly
const patterns: ((w: WordLists, pick: Pick) => string[])[] = [
  // A: adj-noun-verb-to-adj-noun
  (w, p) => [p(w.adjectives), p(w.nouns), p(w.verbs), "to", p(w.adjectives), p(w.nouns)],
  // B: noun-of-adj-noun-verb
  (w, p) => [p(w.nouns), "of", p(w.adjectives), p(w.nouns), p(w.verbs)],
  // C: adj-noun-verb-with-adj-noun
  (w, p) => [p(w.adjectives), p(w.nouns), p(w.verbs), "with", p(w.adjectives), p(w.nouns)],
  // D: verb-adj-noun-into-noun
  (w, p) => [p(w.verbs), p(w.adjectives), p(w.nouns), "into", p(w.nouns)],
  // E: adj-noun-adv-verb
  (w, p) => [p(w.adjectives), p(w.nouns), p(w.adverbs), p(w.verbs)],
  // F: noun-adv-verb-adj-noun
  (w, p) => [p(w.nouns), p(w.adverbs), p(w.verbs), p(w.adjectives), p(w.nouns)],
];

export const PATTERN_COUNT = patterns.length;

export function generatePhrase(words: WordLists, random: Random = Math.random): string {
  const pick: Pick = (list) => list[Math.floor(random() * list.length)];
  const pattern = patterns[Math.floor(random() * patterns.length)];
  return pattern(words, pick).join("-");
}
