import { createHash } from "node:crypto";
import { getDomain } from "tldts";
import type { CanonicalUrl } from "./canonicalize";

const MAX_HOST_SUFFIX_VARIANTS = 4;
const MAX_PATH_PREFIXES = 4;
const MAX_EXPRESSIONS = 30;

/**
 * Host-suffix / path-prefix expressions for a canonical URL, per "Host-Suffix Path-Prefix
 * Expressions" in https://developers.google.com/safe-browsing/reference/URLs.and.Hashing:
 * - hosts (≤ 5): the exact host, then for domain names the registrable domain (eTLD+1, ICANN
 *   section of the Public Suffix List) with successive leading labels added back, up to four;
 * - paths (≤ 6): path + query, path, and up to four root prefixes ending in `/`.
 * Ordered exact host first and longest suffix first, deduplicated, capped at 30.
 */
export function expressionsFor({ host, path, query, isIp }: CanonicalUrl): string[] {
  const hosts = [host, ...(isIp ? [] : hostSuffixes(host))];
  const paths = [...(query === null ? [] : [`${path}?${query}`]), path, ...pathPrefixes(path)];

  const expressions = new Set<string>();
  for (const h of hosts) for (const p of paths) expressions.add(`${h}${p}`);
  return [...expressions].slice(0, MAX_EXPRESSIONS);
}

function hostSuffixes(host: string): string[] {
  // validateHostname: false — the URL parser accepts labels tldts calls invalid (`-x.evil.com`),
  // and those must still be checked under their registrable domain.
  const domain = getDomain(host, { allowPrivateDomains: false, validateHostname: false });
  // Single-label hosts and bare public suffixes (`co.uk`) have no registrable domain.
  if (!domain) return [];
  const labels = host.split(".");
  const domainLabels = domain.split(".").length;
  const suffixes: string[] = [];
  for (let n = domainLabels; n <= labels.length && suffixes.length < MAX_HOST_SUFFIX_VARIANTS; n++) {
    suffixes.push(labels.slice(-n).join("."));
  }
  return suffixes.reverse();
}

function pathPrefixes(path: string): string[] {
  // Directories only: drop the last component (a file name, or "" for a trailing slash).
  const directories = path.split("/").slice(1, -1);
  const prefixes = ["/"];
  for (let i = 1; i <= directories.length && prefixes.length < MAX_PATH_PREFIXES; i++) {
    prefixes.push(`/${directories.slice(0, i).join("/")}/`);
  }
  return prefixes;
}

/** SHA-256 of the expression. */
export function fullHash(expression: string): Buffer {
  return createHash("sha256").update(expression, "utf8").digest();
}

/** First 4 bytes of the full hash, base64 encoded, as `hashes.search` expects. */
export function hashPrefix(hash: Buffer): string {
  return hash.subarray(0, 4).toString("base64");
}
