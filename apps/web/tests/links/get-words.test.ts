import { describe, expect, it } from "vitest";
import { getWords } from "@/lib/links/get-words";

describe("getWords", () => {
  it("loads the seeded word lists", async () => {
    const words = await getWords();
    expect(words.adjectives).toHaveLength(40);
    expect(words.nouns).toHaveLength(45);
    expect(words.verbs).toHaveLength(30);
    expect(words.adverbs).toHaveLength(20);
    expect(words.adjectives[0]).toBe("purple");
  });

  it("returns the cached lists on later calls", async () => {
    expect(await getWords()).toBe(await getWords());
  });
});
