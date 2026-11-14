import { createHmac } from "node:crypto";
import { isIP } from "node:net";

type HeaderSource = { get(name: string): string | null };

/**
 * The client's address, normalized for bucketing, or null when the headers carry no valid one.
 *
 * Trusts `x-real-ip`, then the first `x-forwarded-for` entry. That is only safe behind a proxy that
 * overwrites both headers (Vercel's edge is assumed to; see docs/adr/0004-rate-limiting.md). Without
 * one, a client can send any value and pick its own bucket.
 */
export function getClientIp(headers: HeaderSource): string | null {
  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp) return normalizeIp(realIp);
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded ? normalizeIp(forwarded) : null;
}

/**
 * IPv4 as-is; IPv4-mapped IPv6 (`::ffff:a.b.c.d`) as the IPv4 address; other IPv6 as its /64 prefix
 * in full form, since one subscriber usually gets a whole /64. Anything else is null.
 */
export function normalizeIp(raw: string): string | null {
  const value = raw.trim().replace(/^\[(.*)\]$/, "$1");
  const kind = isIP(value);
  if (kind === 4) return value;
  if (kind !== 6) return null;

  const hextets = expandIpv6(value.replace(/%.*$/, ""));
  if (!hextets) return null;
  if (hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff) {
    return [hextets[6] >> 8, hextets[6] & 0xff, hextets[7] >> 8, hextets[7] & 0xff].join(".");
  }
  return `${hextets
    .slice(0, 4)
    .map((h) => h.toString(16).padStart(4, "0"))
    .join(":")}::/64`;
}

// Eight 16-bit groups. Input has already passed isIP(), so only the shapes it accepts are handled.
function expandIpv6(address: string): number[] | null {
  const toGroups = (part: string): number[] =>
    part === ""
      ? []
      : part.split(":").flatMap((group) => {
          if (!group.includes(".")) return [parseInt(group, 16)];
          const [a, b, c, d] = group.split(".").map(Number);
          return [(a << 8) | b, (c << 8) | d];
        });

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const head = toGroups(halves[0]);
  if (halves.length === 1) return head.length === 8 ? head : null;
  const tail = toGroups(halves[1]);
  const missing = 8 - head.length - tail.length;
  if (missing < 1) return null;
  return [...head, ...Array<number>(missing).fill(0), ...tail];
}

/** Clients without a usable address share this bucket. */
export const UNKNOWN_CLIENT = "unknown";

/**
 * The stored rate-limit key: HMAC-SHA256 of the normalized address, as 64 hex characters. Keyed so
 * the table never holds raw addresses or hashes that could be reversed by enumerating IPv4.
 */
export function clientKey(normalizedIp: string | null, secret: string): string {
  return createHmac("sha256", secret)
    .update(normalizedIp ?? UNKNOWN_CLIENT)
    .digest("hex");
}
