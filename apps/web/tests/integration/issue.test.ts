import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { urlMappings } from "@/db/schema";
import { issueShortUrl } from "@/lib/issue";
import { resetUrlTables } from "./helpers";

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

  it("rejects invalid URLs without touching the database", async () => {
    const result = await issueShortUrl("file:///etc/passwd");
    expect(result).toMatchObject({ ok: false, status: 400 });
    expect(await db.$count(urlMappings)).toBe(0);
  });
});
