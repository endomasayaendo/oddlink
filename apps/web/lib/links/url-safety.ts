/**
 * True when the URL carries a username or password (`https://google.com@evil.example`).
 * The part before `@` looks like the destination but is not, which makes these URLs a
 * common phishing disguise. Shared by issuing and redirecting so the two rules can't drift.
 * An empty userinfo (`https://@example.com`) parses to empty strings and is not flagged.
 */
export function hasUserinfo(url: URL): boolean {
  return url.username !== "" || url.password !== "";
}

const DEFAULT_PORTS: Record<string, string> = { "http:": "80", "https:": "443" };

// The WHATWG parser already lowercases hosts, converts IDN labels to punycode and canonicalizes
// IPv4 forms, so only the trailing dot of a fully qualified name is left to remove.
const normalizeHost = (hostname: string) => hostname.replace(/\.$/, "");

const isLoopback = (host: string) =>
  host === "localhost" || host.endsWith(".localhost") || /^127\.\d+\.\d+\.\d+$/.test(host) || host === "[::1]";

const isIpLiteral = (host: string) => host.startsWith("[") || /^\d+\.\d+\.\d+\.\d+$/.test(host);

function sameSite(target: string, own: string): boolean {
  if (target === own) return true;
  if (isLoopback(own)) return isLoopback(target);
  if (isIpLiteral(own)) return false;
  // `www.` and the bare name are usually served by the same deployment (one redirects to the other).
  const bare = (host: string) => host.replace(/^www\./, "");
  return bare(target) === bare(own);
}

function decodePath(pathname: string): string {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return pathname;
  }
}

/**
 * True when the URL points back at this app's own short links, so issuing it would let a short
 * link redirect to another short link (or to itself). `baseUrl` is the configured public origin
 * plus optional path prefix.
 *
 * Hosts match exactly, ignoring a trailing dot, with `www.` and the bare name treated as one, and
 * every loopback name treated as one when the app itself runs on loopback. Ports match when they
 * are equal, and also when both are the scheme defaults, since http on port 80 normally just
 * redirects to https on port 443. With a path prefix, only paths at or under it match.
 */
export function pointsAtOwnShortLinks(url: URL, baseUrl: string): boolean {
  const own = new URL(baseUrl);
  if (!sameSite(normalizeHost(url.hostname), normalizeHost(own.hostname))) return false;

  const port = url.port || DEFAULT_PORTS[url.protocol];
  const ownPort = own.port || DEFAULT_PORTS[own.protocol];
  const bothDefault = port === DEFAULT_PORTS[url.protocol] && ownPort === DEFAULT_PORTS[own.protocol];
  if (port !== ownPort && !bothDefault) return false;

  const prefix = own.pathname.replace(/\/+$/, "");
  if (prefix === "") return true;
  const path = decodePath(url.pathname);
  return path === prefix || path.startsWith(`${prefix}/`);
}
