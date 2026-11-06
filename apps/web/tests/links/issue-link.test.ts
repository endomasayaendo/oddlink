import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { generatePhrase, type WordLists } from "@oddlink/utils";
import { SHORT_CODE_MAX_LENGTH } from "@/lib/constants";
import { db } from "@/lib/db";
import { urlMappings } from "@/lib/db/schema";
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
    // Words at the varchar(50) limit: pattern A renders to 305 characters, pattern E to 203.
    const long = (prefix: string) => [prefix.padEnd(50, "x")];
    const words: WordLists = { adjectives: long("adj"), nouns: long("noun"), verbs: long("verb"), adverbs: long("adv") };
    const patternA = () => 0; // random() == 0 picks the first pattern and the first word
    const patternE = () => 4.5 / 6;
    const phrases = [generatePhrase(words, patternA), generatePhrase(words, patternE)];
    expect(phrases[0].length).toBeGreaterThan(SHORT_CODE_MAX_LENGTH);
    expect(phrases[1].length).toBeLessThanOrEqual(SHORT_CODE_MAX_LENGTH);

    const result = await issueShortUrl("https://example.com", { generate: sequence(...phrases) });
    expect(result).toMatchObject({ ok: true, shortCode: phrases[1] });
  });

  it("gives up with 503 when every phrase is too long", async () => {
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
  });

  it("rejects invalid URLs without touching the database", async () => {
    const result = await issueShortUrl("file:///etc/passwd");
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(await db.$count(urlMappings)).toBe(0);
  });
});
