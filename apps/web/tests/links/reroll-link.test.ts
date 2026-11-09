import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { accessLog, SHORT_CODE_MAX_LENGTH, urlMappings } from "@/lib/db/schema";
import { issueAction } from "@/lib/actions/issue-link";
import { rerollAction } from "@/lib/actions/reroll-link";
import { issueShortUrl } from "@/lib/links/issue-link";
import { rerollShortUrl } from "@/lib/links/reroll-link";
import { resolveShortCode } from "@/lib/links/resolve-link";
import { REROLL_WINDOW_MS, signRerollToken } from "@/lib/links/reroll-token";
import { resetUrlTables } from "../utils/reset-db";

resetUrlTables();

const sequence = (...codes: string[]) => {
  let i = 0;
  return async () => codes[Math.min(i++, codes.length - 1)];
};

const findByCode = (shortCode: string) =>
  db.query.urlMappings.findFirst({ where: eq(urlMappings.shortCode, shortCode) });

/** Issues `code` for `url` and returns its row id and a fresh reroll token. */
async function issue(code: string, url = "https://example.com/page", now?: () => number) {
  const result = await issueShortUrl(url, { generate: sequence(code) });
  if (!result.ok) throw new Error("issue failed");
  return { id: result.id, token: signRerollToken({ id: result.id, code }, { now }) };
}

const UNAVAILABLE = { ok: false, status: 503, message: "Service temporarily unavailable" };
const ALREADY = { ok: false, status: 409, message: "Already rerolled" };

describe("rerollShortUrl", () => {
  it("gives the same row a new phrase", async () => {
    const { id, token } = await issue("old-phrase");
    const result = await rerollShortUrl(token, { generate: sequence("new-phrase") });

    expect(result).toEqual({
      ok: true,
      shortCode: "new-phrase",
      shortUrl: "http://localhost:3000/new-phrase",
      originalUrl: "https://example.com/page",
    });
    expect(await findByCode("new-phrase")).toMatchObject({ id, originalUrl: "https://example.com/page" });
    expect(await db.$count(urlMappings)).toBe(1);
  });

  it("stops the old phrase resolving and resolves the new one", async () => {
    const { token } = await issue("old-phrase");
    await rerollShortUrl(token, { generate: sequence("new-phrase") });

    expect(await resolveShortCode("old-phrase")).toBeNull();
    expect(await resolveShortCode("new-phrase")).toMatchObject({ originalUrl: "https://example.com/page" });
  });

  it("keeps the click count, access log, creation and expiry dates", async () => {
    const { id, token } = await issue("old-phrase");
    await resolveShortCode("old-phrase");
    await resolveShortCode("old-phrase");
    const before = await findByCode("old-phrase");

    await rerollShortUrl(token, { generate: sequence("new-phrase") });
    await resolveShortCode("new-phrase");

    const after = await findByCode("new-phrase");
    expect(after).toMatchObject({ id, accessCount: 3, createdAt: before!.createdAt, expiresAt: before!.expiresAt });
    expect(await db.$count(accessLog, eq(accessLog.urlMappingId, id))).toBe(3);
  });

  it("works only once per token", async () => {
    const { token } = await issue("old-phrase");
    expect((await rerollShortUrl(token, { generate: sequence("new-phrase") })).ok).toBe(true);
    expect(await rerollShortUrl(token, { generate: sequence("third-phrase") })).toEqual(ALREADY);
    expect(await findByCode("new-phrase")).toBeDefined();
    expect(await findByCode("third-phrase")).toBeUndefined();
  });

  it("only one of two concurrent rerolls wins", async () => {
    const { token } = await issue("old-phrase");
    const results = await Promise.all([
      rerollShortUrl(token, { generate: sequence("phrase-a") }),
      rerollShortUrl(token, { generate: sequence("phrase-b") }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    expect(results.filter((r) => !r.ok)).toEqual([ALREADY]);
    expect(await db.$count(urlMappings)).toBe(1);
  });

  it("rejects a token for a deleted link", async () => {
    const { id, token } = await issue("old-phrase");
    await db.delete(urlMappings).where(eq(urlMappings.id, id));
    expect(await rerollShortUrl(token, { generate: sequence("new-phrase") })).toEqual(ALREADY);
    expect(await db.$count(urlMappings)).toBe(0);
  });

  it("rejects an expired token without touching the link", async () => {
    const issuedAt = Date.now() - REROLL_WINDOW_MS - 1;
    const { token } = await issue("old-phrase", undefined, () => issuedAt);
    expect(await rerollShortUrl(token, { generate: sequence("new-phrase") })).toEqual({
      ok: false,
      status: 410,
      message: "Too late to reroll",
    });
    expect(await findByCode("old-phrase")).toBeDefined();
  });

  it("honours an injected clock", async () => {
    const { token } = await issue("old-phrase");
    const later = () => Date.now() + REROLL_WINDOW_MS;
    expect(await rerollShortUrl(token, { generate: sequence("new-phrase"), now: later })).toMatchObject({ status: 410 });
  });

  it("rejects a forged or malformed token", async () => {
    const { id } = await issue("old-phrase");
    const forged = signRerollToken({ id, code: "old-phrase" }, { secret: "x".repeat(32) });
    for (const token of [forged, "garbage", undefined]) {
      expect(await rerollShortUrl(token, { generate: sequence("new-phrase") })).toEqual({
        ok: false,
        status: 400,
        message: "Invalid reroll request",
      });
    }
    expect(await findByCode("old-phrase")).toBeDefined();
  });

  it("retries when the new phrase is taken by another link", async () => {
    await issue("taken-phrase", "https://other.example");
    const { id, token } = await issue("old-phrase");
    const result = await rerollShortUrl(token, { generate: sequence("taken-phrase", "free-phrase") });

    expect(result).toMatchObject({ ok: true, shortCode: "free-phrase" });
    expect((await findByCode("taken-phrase"))?.originalUrl).toBe("https://other.example");
    expect((await findByCode("free-phrase"))?.id).toBe(id);
  });

  it("does not 'reroll' to the same phrase", async () => {
    const { token } = await issue("old-phrase");
    const result = await rerollShortUrl(token, { generate: sequence("old-phrase", "new-phrase") });
    expect(result).toMatchObject({ ok: true, shortCode: "new-phrase" });
  });

  it("regenerates phrases too long for the column", async () => {
    const { token } = await issue("old-phrase");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const result = await rerollShortUrl(token, { generate: sequence("a".repeat(SHORT_CODE_MAX_LENGTH + 1), "new-phrase") });
    expect(result).toMatchObject({ ok: true, shortCode: "new-phrase" });
    warn.mockRestore();
  });

  it("gives up with 503 after five collisions and leaves the link alone", async () => {
    await issue("taken-phrase", "https://other.example");
    const { token } = await issue("old-phrase");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    let calls = 0;
    const result = await rerollShortUrl(token, {
      generate: async () => {
        calls++;
        return "taken-phrase";
      },
    });

    expect(result).toEqual(UNAVAILABLE);
    expect(calls).toBe(5);
    expect(warn).toHaveBeenLastCalledWith(expect.stringContaining("Failed to reroll a short code after 5 attempts (5 collisions, 0 too long)"));
    warn.mockRestore();
    // The token is still good, so the user can try again.
    expect(await rerollShortUrl(token, { generate: sequence("new-phrase") })).toMatchObject({ ok: true });
  });

  it("returns 503 when generating fails", async () => {
    const { token } = await issue("old-phrase");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = await rerollShortUrl(token, {
      generate: async () => {
        throw new Error("Word lists cannot be empty");
      },
    });
    expect(result).toEqual(UNAVAILABLE);
    expect(error).toHaveBeenCalledWith("Failed to reroll a short code", expect.any(Error));
    error.mockRestore();
  });
});

describe("issueAction / rerollAction", () => {
  const form = (originalUrl: string) => {
    const data = new FormData();
    data.set("originalUrl", originalUrl);
    return data;
  };

  it("returns a reroll token with the issued link, and the token rerolls it once", async () => {
    const issued = await issueAction(null, form("https://example.com/action"));
    if (!issued?.ok) throw new Error("issue failed");
    expect(Object.keys(issued).sort()).toEqual(["ok", "originalUrl", "rerollToken", "shortCode", "shortUrl"]);

    const rerolled = await rerollAction(issued.rerollToken);
    if (!rerolled.ok) throw new Error("reroll failed");
    expect(rerolled.shortCode).not.toBe(issued.shortCode);
    expect(rerolled).toEqual({
      ok: true,
      shortCode: rerolled.shortCode,
      shortUrl: `http://localhost:3000/${rerolled.shortCode}`,
      originalUrl: "https://example.com/action",
    });
    expect(await rerollAction(issued.rerollToken)).toEqual({ ok: false, message: "Already rerolled", canRetry: false });
  });

  it("hides the status and says whether trying again can help", async () => {
    expect(await rerollAction("garbage")).toEqual({ ok: false, message: "Invalid reroll request", canRetry: false });
  });
});
