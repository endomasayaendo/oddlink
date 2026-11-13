import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalize } from "@/lib/links/safe-browsing/canonicalize";
import { createSafeBrowsingClient, SEARCH_ENDPOINT } from "@/lib/links/safe-browsing/client";
import { expressionsFor, fullHash, hashPrefix } from "@/lib/links/safe-browsing/expressions";

const API_KEY = "test-api-key-123";
const URL_TO_CHECK = "https://phish.example.com/login/secret-token?user=alice";

const hashOf = (expression: string) => fullHash(expression).toString("base64");
const prefixesOf = (url: string) => expressionsFor(canonicalize(url)).map((e) => hashPrefix(fullHash(e)));

type FullHash = { fullHash: string; fullHashDetails?: { threatType: string; attributes?: string[] }[] };
const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const matchResponse = (fullHashes: FullHash[], cacheDuration = "300s") => jsonResponse({ fullHashes, cacheDuration });
const flagged = (threatType = "SOCIAL_ENGINEERING", attributes?: string[]): FullHash => ({
  fullHash: hashOf("phish.example.com/login/"),
  fullHashDetails: [{ threatType, ...(attributes && { attributes }) }],
});

let clock = 0;
let warn: ReturnType<typeof vi.spyOn>;

function setup(respond: (url: URL, init: RequestInit) => Response | Promise<Response>, options = {}) {
  const fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => respond(new URL(String(input)), init!));
  const client = createSafeBrowsingClient({
    apiKey: API_KEY,
    userAgent: "oddlink/test",
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => clock,
    ...options,
  });
  return { client, fetch };
}

beforeEach(() => {
  clock = 1_000_000;
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
  vi.useRealTimers();
});

describe("verdicts", () => {
  it("is unsafe when a full hash matches a blocked threat type", async () => {
    for (const threatType of ["MALWARE", "SOCIAL_ENGINEERING", "UNWANTED_SOFTWARE", "POTENTIALLY_HARMFUL_APPLICATION"]) {
      const { client } = setup(() => matchResponse([flagged(threatType)]));
      expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    }
  });

  it("is safe when only the prefix matches, not the full hash", async () => {
    const full = fullHash("phish.example.com/login/");
    const other = Buffer.concat([full.subarray(0, 4), Buffer.alloc(28, 7)]).toString("base64");
    const { client } = setup(() => matchResponse([{ fullHash: other, fullHashDetails: [{ threatType: "MALWARE" }] }]));
    expect(await client.check(URL_TO_CHECK)).toBe("safe");
  });

  it.each([
    ["CANARY", ["CANARY"]],
    ["FRAME_ONLY", ["FRAME_ONLY"]],
    ["an unknown attribute", ["SOMETHING_NEW"]],
    ["THREAT_ATTRIBUTE_UNSPECIFIED", ["THREAT_ATTRIBUTE_UNSPECIFIED"]],
  ])("ignores details with %s", async (_label, attributes) => {
    const { client } = setup(() => matchResponse([flagged("MALWARE", attributes)]));
    expect(await client.check(URL_TO_CHECK)).toBe("safe");
  });

  it.each(["THREAT_TYPE_UNSPECIFIED", "SOME_FUTURE_THREAT"])("ignores threat type %s", async (threatType) => {
    const { client } = setup(() => matchResponse([flagged(threatType)]));
    expect(await client.check(URL_TO_CHECK)).toBe("safe");
  });

  it("is safe for an empty response (fields omitted, as proto3 JSON does)", async () => {
    const { client } = setup(() => jsonResponse({}));
    expect(await client.check(URL_TO_CHECK)).toBe("safe");
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs only the host and threat types when flagged", async () => {
    const { client } = setup(() => matchResponse([flagged()]));
    await client.check(URL_TO_CHECK);
    expect(warn).toHaveBeenCalledWith("safe_browsing outcome=flagged", {
      host: "phish.example.com",
      threatTypes: ["SOCIAL_ENGINEERING"],
    });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain("login");
    expect(logged).not.toContain("secret-token");
  });
});

describe("request", () => {
  it("sends only hash prefixes, with the key in a header", async () => {
    const { client, fetch } = setup(() => jsonResponse({}));
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0];
    const url = new URL(String(input));
    expect(`${url.origin}${url.pathname}`).toBe(SEARCH_ENDPOINT);
    expect(url.searchParams.getAll("hashPrefixes").sort()).toEqual(prefixesOf(URL_TO_CHECK).sort());
    expect(url.searchParams.get("$alt")).toBe("json");
    expect(url.searchParams.has("key")).toBe(false);
    expect(new Headers(init!.headers).get("X-Goog-Api-Key")).toBe(API_KEY);
    expect(new Headers(init!.headers).get("User-Agent")).toBe("oddlink/test");
    expect(init!.body).toBeUndefined();

    const sent = `${String(input)} ${JSON.stringify(init)}`;
    for (const piece of ["phish.example.com", "login", "secret-token", "alice"]) expect(sent).not.toContain(piece);
    expect(String(input)).not.toContain(API_KEY);
  });
});

describe("failures are unknown (fail open)", () => {
  it.each([400, 403, 429, 500, 503])("HTTP %i", async (status) => {
    const { client } = setup(() => jsonResponse({ error: { code: status } }, status));
    expect(await client.check(URL_TO_CHECK)).toBe("unknown");
    expect(warn).toHaveBeenCalledWith("safe_browsing outcome=error", expect.objectContaining({ status }));
  });

  it("bad JSON", async () => {
    const { client } = setup(() => new Response("<html>oops", { status: 200 }));
    expect(await client.check(URL_TO_CHECK)).toBe("unknown");
  });

  it("an unexpected response shape", async () => {
    const { client } = setup(() => jsonResponse({ fullHashes: "nope" }));
    expect(await client.check(URL_TO_CHECK)).toBe("unknown");
  });

  it("a network error, logged without the URL or key", async () => {
    const { client } = setup(() => {
      throw new TypeError("fetch failed");
    });
    expect(await client.check(URL_TO_CHECK)).toBe("unknown");
    expect(warn).toHaveBeenCalledWith("safe_browsing outcome=error", { error: "TypeError", durationMs: 0 });
    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(API_KEY);
    expect(logged).not.toContain("phish.example.com");
  });

  it("a timeout after 1000 ms, with no retry", async () => {
    vi.useFakeTimers();
    const { client, fetch } = setup(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const verdict = client.check(URL_TO_CHECK);
    await vi.advanceTimersByTimeAsync(999);
    expect(warn).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(await verdict).toBe("unknown");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("safe_browsing outcome=timeout", expect.objectContaining({ error: "AbortError" }));
  });

  it("does not cache failures", async () => {
    let fail = true;
    const { client, fetch } = setup(() => (fail ? jsonResponse({}, 500) : jsonResponse({ cacheDuration: "300s" })));
    expect(await client.check(URL_TO_CHECK)).toBe("unknown");
    fail = false;
    expect(await client.check(URL_TO_CHECK)).toBe("safe");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("cache", () => {
  it("answers from the cache until cacheDuration passes, without extending it", async () => {
    const { client, fetch } = setup(() => matchResponse([flagged()], "60s"));
    expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    clock += 30_000;
    expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    expect(fetch).toHaveBeenCalledTimes(1);
    clock += 30_000; // 60 s after the first response, even though it was read at 30 s
    expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches prefixes with no match too", async () => {
    const { client, fetch } = setup(() => jsonResponse({ cacheDuration: "60s" }));
    await client.check(URL_TO_CHECK);
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("only asks for prefixes it does not have", async () => {
    const { client, fetch } = setup(() => jsonResponse({ cacheDuration: "60s" }));
    await client.check("https://example.com/a/");
    await client.check("https://example.com/b/");
    const second = new URL(String(fetch.mock.calls[1][0])).searchParams.getAll("hashPrefixes");
    expect(second).toEqual([hashPrefix(fullHash("example.com/b/"))]);
  });

  it("returns a cached match without asking again, even if a lookup would fail", async () => {
    let calls = 0;
    const { client, fetch } = setup(() => (calls++ === 0 ? matchResponse([flagged()], "60s") : jsonResponse({}, 503)));
    expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    // Shares the flagged phish.example.com/login/ expression, plus prefixes that are not cached.
    expect(await client.check("https://phish.example.com/login/other-page")).toBe("unsafe");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caps cacheDuration at 30 minutes", async () => {
    const { client, fetch } = setup(() => jsonResponse({ cacheDuration: "86400s" }));
    await client.check(URL_TO_CHECK);
    clock += 30 * 60 * 1000 - 1;
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock += 1;
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("accepts fractional durations and skips caching a missing or malformed one", async () => {
    let duration: string | undefined = "1.5s";
    const { client, fetch } = setup(() => jsonResponse(duration ? { cacheDuration: duration } : {}));
    await client.check(URL_TO_CHECK);
    clock += 1499;
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock += 1;
    duration = undefined;
    await client.check(URL_TO_CHECK);
    await client.check(URL_TO_CHECK);
    duration = "soon";
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("stays within its size bound, dropping the oldest entries", async () => {
    const { client, fetch } = setup(() => jsonResponse({ cacheDuration: "600s" }), { maxCacheEntries: 3 });
    await client.check("https://one.example/"); // prefixes: one.example/
    await client.check("https://two.example/");
    await client.check("https://three.example/");
    await client.check("https://four.example/"); // evicts one.example/
    await client.check("https://four.example/");
    await client.check("https://two.example/");
    expect(fetch).toHaveBeenCalledTimes(4);
    await client.check("https://one.example/");
    expect(fetch).toHaveBeenCalledTimes(5);
  });
});
