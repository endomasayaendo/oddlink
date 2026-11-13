import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canonicalize } from "@/lib/links/safe-browsing/canonicalize";
import { createSafeBrowsingClient, SEARCH_ENDPOINT } from "@/lib/links/safe-browsing/client";
import { expressionsFor, fullHash, hashPrefix } from "@/lib/links/safe-browsing/expressions";
import { CAPTURED, encodeResponse, type FullHashSpec, ThreatAttribute, ThreatType, varintField } from "./protobuf-fixtures";

const API_KEY = "test-api-key-123";
const URL_TO_CHECK = "https://phish.example.com/login/secret-token?user=alice";

const prefixesOf = (url: string) => expressionsFor(canonicalize(url)).map((e) => hashPrefix(fullHash(e)));

const protoResponse = (body: Uint8Array) =>
  new Response(new Uint8Array(body), { status: 200, headers: { "content-type": "application/x-protobuf" } });
const cacheFor = (cacheSeconds: number) => protoResponse(encodeResponse({ cacheSeconds }));
const emptyResponse = () => protoResponse(new Uint8Array());
// Google's error bodies are JSON even when the success body is protobuf.
const errorResponse = (status: number) =>
  new Response(JSON.stringify({ error: { code: status } }), { status, headers: { "content-type": "application/json" } });
const matchResponse = (fullHashes: FullHashSpec[], cacheSeconds = 300) =>
  protoResponse(encodeResponse({ fullHashes, cacheSeconds }));
const flagged = (threatType: number = ThreatType.SOCIAL_ENGINEERING, attributes?: number[]): FullHashSpec => ({
  fullHash: fullHash("phish.example.com/login/"),
  details: [{ threatType, attributes }],
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
    for (const threatType of [
      ThreatType.MALWARE,
      ThreatType.SOCIAL_ENGINEERING,
      ThreatType.UNWANTED_SOFTWARE,
      ThreatType.POTENTIALLY_HARMFUL_APPLICATION,
    ]) {
      const { client } = setup(() => matchResponse([flagged(threatType)]));
      expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    }
  });

  it("is safe when only the prefix matches, not the full hash", async () => {
    const full = fullHash("phish.example.com/login/");
    const other = Buffer.concat([full.subarray(0, 4), Buffer.alloc(28, 7)]);
    const { client } = setup(() => matchResponse([{ fullHash: other, details: [{ threatType: ThreatType.MALWARE }] }]));
    expect(await client.check(URL_TO_CHECK)).toBe("safe");
  });

  it.each([
    ["CANARY", [ThreatAttribute.CANARY]],
    ["FRAME_ONLY", [ThreatAttribute.FRAME_ONLY]],
    ["an unknown attribute", [7]],
    ["THREAT_ATTRIBUTE_UNSPECIFIED", [ThreatAttribute.THREAT_ATTRIBUTE_UNSPECIFIED]],
  ])("ignores details with %s", async (_label, attributes) => {
    const { client } = setup(() => matchResponse([flagged(ThreatType.MALWARE, attributes)]));
    expect(await client.check(URL_TO_CHECK)).toBe("safe");
  });

  it.each([
    ["THREAT_TYPE_UNSPECIFIED", ThreatType.THREAT_TYPE_UNSPECIFIED],
    ["an unknown threat type", 99],
  ])("ignores %s", async (_label, threatType) => {
    const { client } = setup(() => matchResponse([flagged(threatType)]));
    expect(await client.check(URL_TO_CHECK)).toBe("safe");
  });

  it("is unsafe if any detail of a full hash is enforceable", async () => {
    const { client } = setup(() =>
      matchResponse([
        {
          fullHash: fullHash("phish.example.com/login/"),
          details: [
            { threatType: ThreatType.MALWARE, attributes: [ThreatAttribute.CANARY] },
            { threatType: ThreatType.UNWANTED_SOFTWARE },
          ],
        },
      ]),
    );
    expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
  });

  it("is safe for an empty response (every field omitted, as proto3 does)", async () => {
    const { client } = setup(() => emptyResponse());
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

describe("captured Google responses", () => {
  // Answers like the real API: the captured response for the requested prefix, else no match.
  const replay = (url: URL) => {
    const prefixes = url.searchParams.getAll("hashPrefixes");
    if (prefixes.includes("771MOg==")) return protoResponse(CAPTURED.phishing);
    if (prefixes.includes("WwuJdQ==")) return protoResponse(CAPTURED.malware);
    return protoResponse(CAPTURED.noMatch);
  };

  it.each([
    ["http://testsafebrowsing.appspot.com/s/phishing.html", ["SOCIAL_ENGINEERING"]],
    ["http://testsafebrowsing.appspot.com/s/malware.html", ["POTENTIALLY_HARMFUL_APPLICATION", "MALWARE"]],
  ])("refuses %s", async (url, threatTypes) => {
    const { client } = setup(replay);
    expect(await client.check(url)).toBe("unsafe");
    expect(warn).toHaveBeenCalledWith("safe_browsing outcome=flagged", { host: "testsafebrowsing.appspot.com", threatTypes });
  });

  it("allows https://example.com and caches the 300 s answer", async () => {
    const { client, fetch } = setup(replay);
    expect(await client.check("https://example.com")).toBe("safe");
    clock += 299_999;
    expect(await client.check("https://example.com")).toBe("safe");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("request", () => {
  it("sends only hash prefixes, with the key in a header, asking for protobuf", async () => {
    const { client, fetch } = setup(() => emptyResponse());
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [input, init] = fetch.mock.calls[0];
    const url = new URL(String(input));
    expect(`${url.origin}${url.pathname}`).toBe(SEARCH_ENDPOINT);
    expect(url.searchParams.getAll("hashPrefixes").sort()).toEqual(prefixesOf(URL_TO_CHECK).sort());
    // `$alt=json` makes hashes:search answer 400 "Unsupported Output Format".
    expect([...url.searchParams.keys()].every((key) => key === "hashPrefixes")).toBe(true);
    expect(new Headers(init!.headers).get("Accept")).toBe("application/x-protobuf");
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
    const { client } = setup(() => errorResponse(status));
    expect(await client.check(URL_TO_CHECK)).toBe("unknown");
    expect(warn).toHaveBeenCalledWith("safe_browsing outcome=error", expect.objectContaining({ status }));
  });

  it.each([
    ["HTML", new TextEncoder().encode("<html>oops")],
    ["a truncated response", CAPTURED.phishing.subarray(0, 20)],
    ["a known field with the wrong wire type", varintField(1, 1)],
  ])("an invalid body: %s", async (_label, body) => {
    const { client } = setup(() => protoResponse(body));
    expect(await client.check(URL_TO_CHECK)).toBe("unknown");
    expect(warn).toHaveBeenCalledWith("safe_browsing outcome=error", { error: "invalid_response", durationMs: 0 });
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
    const { client, fetch } = setup(() => (fail ? errorResponse(500) : cacheFor(300)));
    expect(await client.check(URL_TO_CHECK)).toBe("unknown");
    fail = false;
    expect(await client.check(URL_TO_CHECK)).toBe("safe");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

describe("cache", () => {
  it("answers from the cache until cacheDuration passes, without extending it", async () => {
    const { client, fetch } = setup(() => matchResponse([flagged()], 60));
    expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    clock += 30_000;
    expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    expect(fetch).toHaveBeenCalledTimes(1);
    clock += 30_000; // 60 s after the first response, even though it was read at 30 s
    expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("caches prefixes with no match too", async () => {
    const { client, fetch } = setup(() => cacheFor(60));
    await client.check(URL_TO_CHECK);
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("only asks for prefixes it does not have", async () => {
    const { client, fetch } = setup(() => cacheFor(60));
    await client.check("https://example.com/a/");
    await client.check("https://example.com/b/");
    const second = new URL(String(fetch.mock.calls[1][0])).searchParams.getAll("hashPrefixes");
    expect(second).toEqual([hashPrefix(fullHash("example.com/b/"))]);
  });

  it("returns a cached match without asking again, even if a lookup would fail", async () => {
    let calls = 0;
    const { client, fetch } = setup(() => (calls++ === 0 ? matchResponse([flagged()], 60) : errorResponse(503)));
    expect(await client.check(URL_TO_CHECK)).toBe("unsafe");
    // Shares the flagged phish.example.com/login/ expression, plus prefixes that are not cached.
    expect(await client.check("https://phish.example.com/login/other-page")).toBe("unsafe");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("caps cacheDuration at 30 minutes", async () => {
    const { client, fetch } = setup(() => cacheFor(86_400));
    await client.check(URL_TO_CHECK);
    clock += 30 * 60 * 1000 - 1;
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock += 1;
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("accepts fractional durations and skips caching a missing or non-positive one", async () => {
    let duration: { cacheSeconds?: number; cacheNanos?: number } | undefined = { cacheSeconds: 1, cacheNanos: 500_000_000 };
    const { client, fetch } = setup(() => protoResponse(encodeResponse(duration)));
    await client.check(URL_TO_CHECK);
    clock += 1499;
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(1);
    clock += 1;
    duration = undefined;
    await client.check(URL_TO_CHECK);
    await client.check(URL_TO_CHECK);
    duration = { cacheSeconds: -60 };
    await client.check(URL_TO_CHECK);
    expect(fetch).toHaveBeenCalledTimes(4);
  });

  it("stays within its size bound, dropping the oldest entries", async () => {
    const { client, fetch } = setup(() => cacheFor(600), { maxCacheEntries: 3 });
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
