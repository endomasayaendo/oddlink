import { describe, expect, it } from "vitest";
import { canonicalize, canonicalUrlString } from "@/lib/links/safe-browsing/canonicalize";
import { originalUrlSchema } from "@/lib/zod/schemas/links";

// Canonicalizes what issuing would actually pass in: the schema's parsed output.
const canonical = (input: string) => canonicalUrlString(originalUrlSchema.parse(input));

// Test vectors from https://developers.google.com/safe-browsing/v4/urls-hashing
// ("Canonicalization", accessed 2026-11-11). v5 keeps the same rules
// (https://developers.google.com/safe-browsing/reference/URLs.and.Hashing).
describe("Google's canonicalization vectors", () => {
  it.each([
    ["http://host/%25%32%35", "http://host/%25"],
    ["http://host/%25%32%35%25%32%35", "http://host/%25%25"],
    ["http://host/%2525252525252525", "http://host/%25"],
    ["http://host/asdf%25%32%35asd", "http://host/asdf%25asd"],
    ["http://host/%%%25%32%35asd%%", "http://host/%25%25%25asd%25%25"],
    ["http://www.google.com/", "http://www.google.com/"],
    [
      "http://%31%36%38%2e%31%38%38%2e%39%39%2e%32%36/%2E%73%65%63%75%72%65/%77%77%77%2E%65%62%61%79%2E%63%6F%6D/",
      "http://168.188.99.26/.secure/www.ebay.com/",
    ],
    [
      "http://195.127.0.11/uploads/%20%20%20%20/.verify/.eBaysecure=updateuserdataxplimnbqmn-xplmvalidateinfoswqpcmlx=hgplmcx/",
      "http://195.127.0.11/uploads/%20%20%20%20/.verify/.eBaysecure=updateuserdataxplimnbqmn-xplmvalidateinfoswqpcmlx=hgplmcx/",
    ],
    ["http://3279880203/blah", "http://195.127.0.11/blah"],
    ["http://www.google.com/blah/..", "http://www.google.com/"],
    ["http://www.evil.com/blah#frag", "http://www.evil.com/blah"],
    ["http://www.GOOgle.com/", "http://www.google.com/"],
    ["http://www.google.com.../", "http://www.google.com/"],
    ["http://www.google.com/foo\tbar\rbaz\n2", "http://www.google.com/foobarbaz2"],
    ["http://www.google.com/q?", "http://www.google.com/q?"],
    ["http://www.google.com/q?r?", "http://www.google.com/q?r?"],
    ["http://www.google.com/q?r?s", "http://www.google.com/q?r?s"],
    ["http://evil.com/foo#bar#baz", "http://evil.com/foo"],
    ["http://evil.com/foo;", "http://evil.com/foo;"],
    ["http://evil.com/foo?bar;", "http://evil.com/foo?bar;"],
    ["http://notrailingslash.com", "http://notrailingslash.com/"],
    ["http://www.gotaport.com:1234/", "http://www.gotaport.com/"],
    ["  http://www.google.com/  ", "http://www.google.com/"],
    ["https://www.securesite.com/", "https://www.securesite.com/"],
    ["http://host.com/ab%23cd", "http://host.com/ab%23cd"],
    ["http://host.com//twoslashes?more//slashes", "http://host.com/twoslashes?more//slashes"],
  ])("%j -> %s", (input, expected) => {
    expect(canonical(input)).toBe(expected);
  });

  // Vectors whose input our schema refuses (no scheme, or a host the URL parser rejects), so they
  // can never reach the checker.
  it.each([
    "www.google.com/",
    "www.google.com",
    "http://\x01\x80.com/",
    "http:// leadingspace.com/",
    "http://%20leadingspace.com/",
    "%20leadingspace.com/",
    "http://host%23.com/%257Ea%2521b%2540c%2523d%2524e%25f%255E00%252611%252A22%252833%252944_55%252B",
  ])("%j is rejected by the URL schema", (input) => {
    expect(originalUrlSchema.safeParse(input).success).toBe(false);
  });
});

describe("canonicalize", () => {
  it.each([
    ["http://[::ffff:1.2.3.4]/", "1.2.3.4"],
    ["http://[::FFFF:102:304]/", "1.2.3.4"],
    ["http://[64:ff9b::1.2.3.4]/", "1.2.3.4"],
    ["http://[2001:0db8:0000::1]/", "[2001:db8::1]"],
    ["http://[64:ff9b:1::1.2.3.4]/", "[64:ff9b:1::102:304]"],
  ])("normalizes IPv6 host %s to %s (v5 rules)", (input, host) => {
    expect(canonicalize(input)).toMatchObject({ host, isIp: true });
  });

  it("parses every legal IPv4 encoding to dotted decimal", () => {
    expect(canonicalize("http://0x45.0x7f.0xb3.0x0b/")).toMatchObject({ host: "69.127.179.11", isIp: true });
    expect(canonicalize("http://0300.0250.0.1/").host).toBe("192.168.0.1");
    expect(canonicalize("http://127.1/").host).toBe("127.0.0.1");
  });

  it("converts IDNs to punycode", () => {
    expect(canonicalUrlString("https://例え.テスト/パス")).toBe("https://xn--r8jz45g.xn--zckzah/%E3%83%91%E3%82%B9");
  });

  it("collapses leading, trailing and duplicate dots in the host", () => {
    expect(canonicalize("http://...a..b.com.../").host).toBe("a.b.com");
    expect(canonicalize("http://a.com./").isIp).toBe(false);
  });

  it("cleans the path but leaves // and dot segments in the query", () => {
    expect(canonicalUrlString("http://a.com/x//y/./z/%2E%2E/w?q=a//b/./c/../d")).toBe(
      "http://a.com/x/y/w?q=a//b/./c/../d",
    );
  });

  it("tells a bare ? apart from no query", () => {
    expect(canonicalize("http://a.com/p?").query).toBe("");
    expect(canonicalize("http://a.com/p").query).toBeNull();
    expect(canonicalize("http://a.com/p?#frag").query).toBe("");
    expect(canonicalize("http://a.com/p#frag?x").query).toBeNull();
  });

  it("drops credentials and the port", () => {
    expect(canonicalUrlString("http://u:p@a.com:8080/x")).toBe("http://a.com/x");
  });

  it("escapes with uppercase hex and keeps reserved characters", () => {
    expect(canonicalUrlString("http://a.com/%7e%3f%2f a?b=%c3%a9 c#d")).toBe("http://a.com/~?/%20a?b=%C3%A9%20c");
  });
});
