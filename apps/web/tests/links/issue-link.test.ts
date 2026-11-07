import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { generatePhrase, PATTERN_COUNT, type WordLists } from "@oddlink/utils";
import { db } from "@/lib/db";
import { SHORT_CODE_MAX_LENGTH, urlMappings } from "@/lib/db/schema";
import { issueShortUrl } from "@/lib/links/issue-link";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const findByCode = (shortCode: string) =>
  db.query.urlMappings.findFirst({ where: eq(urlMappings.shortCode, shortCode) });

const sequence = (...codes: string[]) => {
  let i = 0;
  return async () => codes[Math.min(i++, codes.length - 1)];
};

describe("issueShortUrl", () => {
  it("returns a short code and short URL", async () => {
    const result = await issueShortUrl("https://example.com");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.shortCode).toMatch(/^[a-z]+(-[a-z]+)+$/);
    expect(result.shortUrl).toBe(`http://localhost:3000/${result.shortCode}`);
    expect(result.originalUrl).toBe("https://example.com");
  });

  it("saves the mapping", async () => {
    const result = await issueShortUrl("https://example.com/saved");
    if (!result.ok) throw new Error("issue failed");
    const row = await findByCode(result.shortCode);
    expect(row).toMatchObject({ originalUrl: "https://example.com/saved", accessCount: 0 });
  });

  it("sets the expiry about one year ahead", async () => {
    const result = await issueShortUrl("https://example.com");
    if (!result.ok) throw new Error("issue failed");
    const row = await findByCode(result.shortCode);
    const oneYear = new Date();
    oneYear.setFullYear(oneYear.getFullYear() + 1);
    expect(Math.abs(row!.expiresAt!.getTime() - oneYear.getTime())).toBeLessThan(60_000);
  });

  it("retries with a new phrase when the code already exists", async () => {
    await issueShortUrl("https://first.example", { generate: sequence("taken-code") });
    const result = await issueShortUrl("https://second.example", { generate: sequence("taken-code", "fresh-code") });
    expect(result).toMatchObject({ ok: true, shortCode: "fresh-code" });
    expect((await findByCode("taken-code"))?.originalUrl).toBe("https://first.example");
  });

  it("gives up after five collisions", async () => {
    await issueShortUrl("https://first.example", { generate: sequence("taken-code") });
    let calls = 0;
    const result = await issueShortUrl("https://second.example", {
      generate: async () => {
        calls++;
        return "taken-code";
      },
    });
    expect(result).toEqual({ ok: false, status: 503, message: "Service temporarily unavailable" });
    expect(calls).toBe(5);
  });

  it("regenerates when the phrase is too long for the column", async () => {
    const tooLong = "a".repeat(SHORT_CODE_MAX_LENGTH + 1);
    let calls = 0;
    const next = sequence(tooLong, "fits-code");
    const result = await issueShortUrl("https://example.com", {
      generate: () => {
        calls++;
        return next();
      },
    });
    expect(result).toMatchObject({ ok: true, shortCode: "fits-code" });
    expect(calls).toBe(2);
  });

  it("accepts a phrase exactly at the column length", async () => {
    const maxLength = "a".repeat(SHORT_CODE_MAX_LENGTH);
    const result = await issueShortUrl("https://example.com", { generate: sequence(maxLength) });
    expect(result).toMatchObject({ ok: true, shortCode: maxLength });
    expect(await findByCode(maxLength)).toBeDefined();
  });

  it("regenerates over-long phrases built from 50-character words", async () => {
    // Words at the varchar(50) limit: pattern A (5 words + "to" + 5 hyphens) renders to 257 characters,
    // pattern E (4 words + 3 hyphens) to 203.
    const long = (prefix: string) => [prefix.padEnd(50, "x")];
    const words: WordLists = { adjectives: long("adj"), nouns: long("noun"), verbs: long("verb"), adverbs: long("adv") };
    // Each list has one word, so random() only matters for the pattern pick (A is index 0, E is index 4).
    const patternA = () => 0.5 / PATTERN_COUNT;
    const patternE = () => 4.5 / PATTERN_COUNT;
    const phrases = [generatePhrase(words, patternA), generatePhrase(words, patternE)];
    expect(phrases[0]).toHaveLength(257);
    expect(phrases[1]).toHaveLength(203);

    const result = await issueShortUrl("https://example.com", { generate: sequence(...phrases) });
    expect(result).toMatchObject({ ok: true, shortCode: phrases[1] });
  });

  it("counts characters outside the BMP once, like varchar", async () => {
    const emoji = "\u{1F600}".repeat(SHORT_CODE_MAX_LENGTH); // JS length 510, 255 characters
    const result = await issueShortUrl("https://example.com", { generate: sequence(emoji) });
    expect(result).toMatchObject({ ok: true, shortCode: emoji });
  });

  it("gives up with 503 when every phrase is too long", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const result = await issueShortUrl("https://example.com", {
      generate: async () => {
        calls++;
        return "a".repeat(SHORT_CODE_MAX_LENGTH + 1);
      },
    });
    expect(result).toEqual({ ok: false, status: 503, message: "Service temporarily unavailable" });
    expect(calls).toBe(5);
    expect(await db.$count(urlMappings)).toBe(0);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("is 256 characters"));
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining("(0 collisions, 5 too long)"));
    warn.mockRestore();
  });

  it("rejects invalid URLs without touching the database", async () => {
    const result = await issueShortUrl("file:///etc/passwd");
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(await db.$count(urlMappings)).toBe(0);
  });
});
