// Reads a Postgres connection string the way node-postgres (pg-connection-string) does, without
// ever surfacing a parse error: such errors could echo the password inside the URL.

/**
 * Query parameters that make node-postgres pick its own TLS settings. pg merges the parsed
 * connection string over the options passed next to it, so any of these would replace the `ssl`
 * option built from DATABASE_CA_CERT (dropping the CA, disabling TLS or turning verification off).
 */
const TLS_PARAM = /^(ssl.*|uselibpqcompat)$/i;

/** Names of the TLS-related query parameters in `raw`, in order of appearance. */
export function tlsQueryParams(raw: string): string[] {
  const queryStart = raw.indexOf("?");
  if (queryStart === -1) return [];
  const query = raw.slice(queryStart + 1).split("#")[0];
  const names: string[] = [];
  for (const [name] of new URLSearchParams(query)) {
    if (TLS_PARAM.test(name)) names.push(name);
  }
  return names;
}

/**
 * The server host node-postgres would connect to: a `host` query parameter wins over the authority,
 * an empty host stays empty (the driver then uses its local default) and a leading "/" is a Unix
 * socket directory. Undefined when the string cannot be parsed.
 */
export function databaseHost(raw: string): string | undefined {
  let url: URL;
  let emptyAuthorityHost = false;
  try {
    url = new URL(raw);
  } catch {
    try {
      // `postgres://user:pass@/db?host=...` has credentials but no host, which URL rejects.
      url = new URL(raw.replace("@/", "@placeholder.invalid/"));
      emptyAuthorityHost = true;
    } catch {
      return undefined;
    }
  }
  const fromQuery = url.searchParams.get("host");
  if (fromQuery) return fromQuery;
  if (emptyAuthorityHost) return "";
  try {
    return decodeURIComponent(url.hostname.replace(/^\[(.+)\]$/, "$1"));
  } catch {
    return undefined;
  }
}

/**
 * True for names that reach this machine: localhost and *.localhost, 127.0.0.0/8, 0.0.0.0, ::1, ::
 * and the IPv4-mapped forms of those. Parsing as an http URL first canonicalizes spellings such as
 * 127.1, 0x7f.0.0.1, 2130706433 and 0:0:0:0:0:0:0:1.
 */
export function isLocalHost(host: string): boolean {
  let name = host.toLowerCase();
  const bracketed = name.includes(":") && !name.startsWith("[") ? `[${name}]` : name;
  try {
    name = new URL(`http://${bracketed}`).hostname;
  } catch {
    // Not a valid http host: compare the raw name.
  }
  name = name.replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    /^127\.\d+\.\d+\.\d+$/.test(name) ||
    name === "0.0.0.0" ||
    name === "::1" ||
    name === "::" ||
    /^::ffff:(7f[0-9a-f]{2}:[0-9a-f]{1,4}|0:0)$/.test(name)
  );
}

/** True for a database server on this machine: a local host name, an empty host or a Unix socket. */
export function isLocalDatabaseHost(host: string): boolean {
  return host === "" || host.startsWith("/") || isLocalHost(host);
}
