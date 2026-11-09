import { generatePhrase, PATTERN_COUNT } from "@oddlink/utils";
import { describe, expect, it } from "vitest";
import { getWords } from "@/lib/links/get-words";
import { isPossibleShortCode } from "@/lib/middleware/utils/is-possible-short-code";

describe("isPossibleShortCode", () => {
  it.each([
    ["a generated phrase", "golden-clock-whispers-to-silent-butterfly"],
    ["a non-ASCII code", "café-code"],
    ["255 characters", "a".repeat(255)],
    ["255 code points outside the BMP", "😀".repeat(255)],
  ])("accepts %s", (_, key) => {
    expect(isPossibleShortCode(key)).toBe(true);
  });

  it.each([
    ["an empty key", ""],
    ["256 characters", "a".repeat(256)],
    ["256 code points outside the BMP", "😀".repeat(256)],
    ["NUL", "\0"],
    ["a tab", "\t"],
    ["DEL", "\x7f"],
    ["a C1 control character", "\x85"],
    ["a control character inside a word", "gol\0den"],
    ["a dot", "a.b"],
    ["a file name", "robots.txt"],
  ])("rejects %s", (_, key) => {
    expect(isPossibleShortCode(key)).toBe(false);
  });

  it("accepts every phrase the generator can produce from the seeded words", async () => {
    const words = await getWords();
    // At least as many steps as the longest list has words, so every word is picked at least once.
    const STEPS = Math.max(...Object.values(words).map((list) => list.length));
    for (let pattern = 0; pattern < PATTERN_COUNT; pattern++) {
      for (let step = 0; step < STEPS; step++) {
        // The first random() call picks the pattern, every later one picks a word.
        let call = 0;
        const phrase = generatePhrase(words, () => (call++ === 0 ? (pattern + 0.5) / PATTERN_COUNT : (step + 0.5) / STEPS));
        expect(isPossibleShortCode(phrase), phrase).toBe(true);
      }
    }
  });
});
