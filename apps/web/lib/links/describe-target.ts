/**
 * What the preview page shows about a destination.
 * `host` is `URL.host` as parsed, so an internationalized domain stays in its punycode
 * form (`xn--...`) and is never rendered as look-alike characters; the port is included.
 * `insecure` is true for plain `http:`, whose traffic isn't encrypted.
 */
export function describeTarget(target: URL): { host: string; insecure: boolean } {
  return { host: target.host, insecure: target.protocol === "http:" };
}
