/**
 * URL canonicalization for Safe Browsing v5, per
 * https://developers.google.com/safe-browsing/reference/URLs.and.Hashing (accessed 2026-11-11).
 *
 * Input is a URL our schema already accepted (absolute http/https, parsable by `new URL()`). The
 * WHATWG parser does part of the work for us: IDN to punycode, IPv4 in any legal encoding to four
 * decimal parts, IPv6 compression, lowercasing, dropping tab/CR/LF, and splitting off the fragment.
 * The rest (host dots, mapped IPv6, repeated unescaping, path cleanup, re-escaping) is done here.
 */

export type CanonicalUrl = {
  /** Lowercase host: a domain name, dotted IPv4, or bracketed IPv6. No port. */
  host: string;
  /** Escaped path, always starting with `/`. */
  path: string;
  /** Escaped query without the `?`, or null when the URL has no `?` at all. `""` for a bare `?`. */
  query: string | null;
  /** True when `host` is an IPv4 or IPv6 literal (no host-suffix variants are generated). */
  isIp: boolean;
};

export function canonicalize(input: string): CanonicalUrl {
  const url = new URL(input);

  const { host, isIp } = canonicalHost(url.hostname);
  const path = escape(normalizePath(unescapeFully(url.pathname)));

  // `url.search` is "" for both "/q" and "/q?", so look for the `?` in the serialized URL
  // (the parser keeps a bare `?` there). The fragment is already gone from `href` once we cut at `#`.
  const href = url.href.split("#", 1)[0];
  const hasQuery = href.includes("?");
  const query = hasQuery ? escape(unescapeFully(url.search.slice(1))) : null;

  return { host, path, query, isIp };
}

/** `scheme://host/path?query` — only used to compare against Google's published test vectors. */
export function canonicalUrlString(input: string): string {
  const { host, path, query } = canonicalize(input);
  const scheme = new URL(input).protocol;
  return `${scheme}//${host}${path}${query === null ? "" : `?${query}`}`;
}

function canonicalHost(hostname: string): { host: string; isIp: boolean } {
  if (hostname.startsWith("[")) {
    const mapped = embeddedIpv4(hostname.slice(1, -1));
    return { host: mapped ?? hostname.toLowerCase(), isIp: true };
  }
  const host = hostname.replace(/\.{2,}/g, ".").replace(/^\.+|\.+$/g, "").toLowerCase();
  return { host, isIp: /^\d{1,3}(\.\d{1,3}){3}$/.test(host) };
}

/**
 * IPv4-mapped (`::ffff:a.b.c.d`) and NAT64 well-known-prefix (`64:ff9b::/96`) addresses become
 * plain dotted IPv4. The WHATWG parser always serializes IPv6 as hex groups, e.g. `::ffff:102:304`.
 */
function embeddedIpv4(ipv6: string): string | null {
  const groups = expandIpv6(ipv6);
  if (!groups) return null;
  const isMapped = groups.slice(0, 6).every((g, i) => g === (i === 5 ? 0xffff : 0));
  const isNat64 = groups[0] === 0x64 && groups[1] === 0xff9b && groups.slice(2, 6).every((g) => g === 0);
  if (!isMapped && !isNat64) return null;
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff].join(".");
}

function expandIpv6(ipv6: string): number[] | null {
  const [head, tail] = ipv6.split("::");
  const parse = (part: string | undefined) => (part ? part.split(":").map((g) => parseInt(g, 16)) : []);
  const left = parse(head);
  const right = parse(tail);
  const groups =
    tail === undefined ? left : [...left, ...Array(8 - left.length - right.length).fill(0), ...right];
  return groups.length === 8 && groups.every((g) => Number.isInteger(g) && g >= 0 && g <= 0xffff) ? groups : null;
}

/** Percent-decodes repeatedly until nothing changes. Works on bytes; the result may not be UTF-8. */
function unescapeFully(value: string): Uint8Array {
  let bytes: Uint8Array = new TextEncoder().encode(value);
  for (;;) {
    const next = unescapeOnce(bytes);
    if (next.length === bytes.length) return bytes;
    bytes = next;
  }
}

function unescapeOnce(bytes: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const hi = hexValue(bytes[i + 1]);
    const lo = hexValue(bytes[i + 2]);
    if (bytes[i] === 0x25 && hi !== -1 && lo !== -1) {
      out.push(hi * 16 + lo);
      i += 2;
    } else {
      out.push(bytes[i]);
    }
  }
  return Uint8Array.from(out);
}

function hexValue(byte: number | undefined): number {
  if (byte === undefined) return -1;
  if (byte >= 0x30 && byte <= 0x39) return byte - 0x30;
  const lower = byte | 0x20;
  if (lower >= 0x61 && lower <= 0x66) return lower - 0x61 + 10;
  return -1;
}

/** Resolves `.` and `..` segments and collapses runs of slashes. Never applied to the query. */
function normalizePath(bytes: Uint8Array): Uint8Array {
  const SLASH = 0x2f;
  const segments: Uint8Array[] = [];
  let start = 0;
  for (let i = 0; i <= bytes.length; i++) {
    if (i === bytes.length || bytes[i] === SLASH) {
      segments.push(bytes.subarray(start, i));
      start = i + 1;
    }
  }
  // segments[0] is what precedes the leading slash (empty); the last one is the file name or "".
  const isDot = (s: Uint8Array) => s.length === 1 && s[0] === 0x2e;
  const isDotDot = (s: Uint8Array) => s.length === 2 && s[0] === 0x2e && s[1] === 0x2e;
  const kept: Uint8Array[] = [];
  let trailingSlash = false;
  segments.slice(1).forEach((segment, index, all) => {
    const isLast = index === all.length - 1;
    trailingSlash = false;
    if (isDot(segment)) {
      trailingSlash = true;
    } else if (isDotDot(segment)) {
      kept.pop();
      trailingSlash = true;
    } else if (segment.length === 0) {
      // An empty segment is a duplicate slash, or the trailing slash when it is the last one.
      trailingSlash = isLast;
    } else {
      kept.push(segment);
    }
  });

  const out: number[] = [SLASH];
  kept.forEach((segment, i) => {
    out.push(...segment);
    if (i < kept.length - 1 || trailingSlash) out.push(SLASH);
  });
  return Uint8Array.from(out);
}

/** Percent-encodes bytes <= 0x20, >= 0x7F, `#` and `%` with uppercase hex. */
function escape(bytes: Uint8Array): string {
  let out = "";
  for (const byte of bytes) {
    out +=
      byte <= 0x20 || byte >= 0x7f || byte === 0x23 || byte === 0x25
        ? `%${byte.toString(16).toUpperCase().padStart(2, "0")}`
        : String.fromCharCode(byte);
  }
  return out;
}
