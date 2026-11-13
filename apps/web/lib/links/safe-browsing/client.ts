import { z } from "zod";
import { canonicalize } from "./canonicalize";
import { expressionsFor, fullHash, hashPrefix } from "./expressions";

export type SafetyVerdict = "safe" | "unsafe" | "unknown";

export const SEARCH_ENDPOINT = "https://safebrowsing.googleapis.com/v5/hashes:search";

/** Threat types we refuse to shorten. Anything else (incl. THREAT_TYPE_UNSPECIFIED) is ignored. */
const BLOCKED_THREAT_TYPES = new Set([
  "MALWARE",
  "SOCIAL_ENGINEERING",
  "UNWANTED_SOFTWARE",
  "POTENTIALLY_HARMFUL_APPLICATION",
]);

const MAX_CACHE_DURATION_MS = 30 * 60 * 1000;

export type ClientOptions = {
  apiKey: string;
  userAgent: string;
  fetch?: typeof fetch;
  now?: () => number;
  timeoutMs?: number;
  maxCacheEntries?: number;
};

// Lenient on purpose: unknown fields and enum values must not fail the whole response.
const responseSchema = z.object({
  fullHashes: z
    .array(
      z.object({
        fullHash: z.string(),
        fullHashDetails: z
          .array(z.object({ threatType: z.string(), attributes: z.array(z.string()).optional() }))
          .optional(),
      }),
    )
    .optional(),
  cacheDuration: z.string().optional(),
});

type Detail = { threatType: string; attributes?: string[] };
/** Per prefix: the full hashes the server returned for it (possibly none) and when that expires. */
type CacheEntry = { expiresAt: number; fullHashes: Map<string, Detail[]> };

/**
 * Safe Browsing v5 lookups in No-Storage Real-Time mode
 * (https://developers.google.com/safe-browsing/reference/No.Storage.Real.Time.Mode): only 4-byte
 * hash prefixes leave the process, full hashes are matched here, and responses are cached per
 * prefix in memory. Never throws; any failure is reported as "unknown".
 */
export function createSafeBrowsingClient({
  apiKey,
  userAgent,
  fetch: fetchImpl = globalThis.fetch,
  now = Date.now,
  timeoutMs = 1000,
  maxCacheEntries = 5000,
}: ClientOptions) {
  const cache = new Map<string, CacheEntry>();

  function cached(prefix: string): CacheEntry | undefined {
    const entry = cache.get(prefix);
    if (entry && entry.expiresAt > now()) return entry;
    if (entry) cache.delete(prefix);
    return undefined;
  }

  function store(prefix: string, entry: CacheEntry) {
    cache.delete(prefix);
    while (cache.size >= maxCacheEntries) {
      // Maps iterate in insertion order, so this drops the oldest entry.
      cache.delete(cache.keys().next().value!);
    }
    cache.set(prefix, entry);
  }

  async function search(prefixes: string[]): Promise<Map<string, Detail[]> | null> {
    const params = new URLSearchParams(prefixes.map((p) => ["hashPrefixes", p]));
    // Without $alt=json the API answers in binary protobuf.
    params.set("$alt", "json");
    const started = now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(`${SEARCH_ENDPOINT}?${params}`, {
        headers: { "X-Goog-Api-Key": apiKey, "User-Agent": userAgent, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) {
        console.warn("safe_browsing outcome=error", { status: response.status, durationMs: now() - started });
        return null;
      }
      const parsed = responseSchema.safeParse(await response.json());
      if (!parsed.success) {
        console.warn("safe_browsing outcome=error", { error: "invalid_response", durationMs: now() - started });
        return null;
      }
      const matches = new Map<string, Detail[]>();
      for (const { fullHash: hash, fullHashDetails = [] } of parsed.data.fullHashes ?? []) {
        matches.set(hash, [...(matches.get(hash) ?? []), ...fullHashDetails]);
      }
      const ttl = Math.min(parseDuration(parsed.data.cacheDuration), MAX_CACHE_DURATION_MS);
      if (ttl > 0) {
        // The duration covers every requested prefix, including those with no match.
        for (const prefix of prefixes) {
          const forPrefix = new Map([...matches].filter(([hash]) => prefixOfBase64(hash) === prefix));
          store(prefix, { expiresAt: now() + ttl, fullHashes: forPrefix });
        }
      }
      return matches;
    } catch (error) {
      const timedOut = controller.signal.aborted;
      console.warn(`safe_browsing outcome=${timedOut ? "timeout" : "error"}`, {
        error: error instanceof Error ? error.name : "unknown",
        durationMs: now() - started,
      });
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async function check(url: string): Promise<SafetyVerdict> {
    let canonical;
    let hashes: Buffer[];
    try {
      canonical = canonicalize(url);
      hashes = expressionsFor(canonical).map(fullHash);
    } catch (error) {
      console.warn("safe_browsing outcome=error", { error: error instanceof Error ? error.name : "unknown" });
      return "unknown";
    }

    const known = new Map<string, Detail[]>();
    const missing = new Set<string>();
    for (const hash of hashes) {
      const prefix = hashPrefix(hash);
      const entry = cached(prefix);
      if (entry) for (const [h, details] of entry.fullHashes) known.set(h, details);
      else missing.add(prefix);
    }

    // A cached match is enough: don't let a failing lookup for the other prefixes hide it.
    const cachedThreats = enforceableThreats(hashes, known);
    if (cachedThreats.size === 0 && missing.size > 0) {
      const fetched = await search([...missing]);
      if (!fetched) return "unknown";
      for (const [h, details] of fetched) known.set(h, details);
    }

    const threatTypes = cachedThreats.size > 0 ? cachedThreats : enforceableThreats(hashes, known);
    if (threatTypes.size === 0) return "safe";
    console.warn("safe_browsing outcome=flagged", { host: canonical.host, threatTypes: [...threatTypes] });
    return "unsafe";
  }

  return { check };
}

function enforceableThreats(hashes: Buffer[], known: Map<string, Detail[]>): Set<string> {
  const threatTypes = new Set<string>();
  for (const hash of hashes) {
    for (const detail of known.get(hash.toString("base64")) ?? []) {
      if (isEnforceable(detail)) threatTypes.add(detail.threatType);
    }
  }
  return threatTypes;
}

/**
 * A detail counts only for a threat type we block and with no attributes: CANARY must not be
 * enforced, FRAME_ONLY applies to frames (not top-level navigation), and an unknown or
 * unspecified attribute means the whole detail is disregarded.
 */
function isEnforceable({ threatType, attributes = [] }: Detail): boolean {
  return BLOCKED_THREAT_TYPES.has(threatType) && attributes.length === 0;
}

/** Protobuf Duration JSON (`"300s"`, `"3.5s"`) to milliseconds; 0 when missing or malformed. */
function parseDuration(value: string | undefined): number {
  const match = value?.match(/^(\d+)(?:\.(\d{1,9}))?s$/);
  if (!match) return 0;
  return Number(match[1]) * 1000 + Math.floor(Number(`0.${match[2] ?? "0"}`) * 1000);
}

function prefixOfBase64(hash: string): string {
  return Buffer.from(hash, "base64").subarray(0, 4).toString("base64");
}
