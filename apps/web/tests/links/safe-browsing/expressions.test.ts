import { describe, expect, it } from "vitest";
import { canonicalize } from "@/lib/links/safe-browsing/canonicalize";
import { expressionsFor, fullHash, hashPrefix } from "@/lib/links/safe-browsing/expressions";

const expressions = (url: string) => expressionsFor(canonicalize(url));

// Examples from "Host-Suffix Path-Prefix Expressions" in
// https://developers.google.com/safe-browsing/reference/URLs.and.Hashing (accessed 2026-11-11).
describe("Google's v5 examples", () => {
  it("http://a.b.com/1/2.html?param=1", () => {
    expect(expressions("http://a.b.com/1/2.html?param=1")).toEqual([
      "a.b.com/1/2.html?param=1",
      "a.b.com/1/2.html",
      "a.b.com/",
      "a.b.com/1/",
      "b.com/1/2.html?param=1",
      "b.com/1/2.html",
      "b.com/",
      "b.com/1/",
    ]);
  });

  it("http://a.b.c.d.e.f.com/1.html (b.c.d.e.f.com is skipped)", () => {
    expect(expressions("http://a.b.c.d.e.f.com/1.html")).toEqual([
      "a.b.c.d.e.f.com/1.html",
      "a.b.c.d.e.f.com/",
      "c.d.e.f.com/1.html",
      "c.d.e.f.com/",
      "d.e.f.com/1.html",
      "d.e.f.com/",
      "e.f.com/1.html",
      "e.f.com/",
      "f.com/1.html",
      "f.com/",
    ]);
  });

  it("http://1.2.3.4/1/ (no host variants for IPs)", () => {
    expect(expressions("http://1.2.3.4/1/")).toEqual(["1.2.3.4/1/", "1.2.3.4/"]);
  });

  it("http://example.co.uk/1 (co.uk is a public suffix)", () => {
    expect(expressions("http://example.co.uk/1")).toEqual(["example.co.uk/1", "example.co.uk/"]);
  });
});

describe("expressionsFor", () => {
  it("uses ICANN suffixes only, so private ones like github.io are not treated as eTLDs", () => {
    expect(expressions("https://x.foo.github.io/")).toEqual(["x.foo.github.io/", "foo.github.io/", "github.io/"]);
  });

  it("adds no variants for a single-label host or an IPv6 literal", () => {
    expect(expressions("http://localhost/a/b")).toEqual(["localhost/a/b", "localhost/", "localhost/a/"]);
    expect(expressions("http://[2001:db8::1]/")).toEqual(["[2001:db8::1]/"]);
  });

  it("keeps a bare ? as its own expression", () => {
    expect(expressions("http://a.com/p?")).toEqual(["a.com/p?", "a.com/p", "a.com/"]);
  });

  it("caps paths at six and the total at thirty, without duplicates", () => {
    const result = expressions("http://a.b.c.d.e.f.com/1/2/3/4/5/6.html?q=1");
    expect(result).toHaveLength(30);
    expect(new Set(result).size).toBe(30);
    expect(result.slice(0, 6)).toEqual([
      "a.b.c.d.e.f.com/1/2/3/4/5/6.html?q=1",
      "a.b.c.d.e.f.com/1/2/3/4/5/6.html",
      "a.b.c.d.e.f.com/",
      "a.b.c.d.e.f.com/1/",
      "a.b.c.d.e.f.com/1/2/",
      "a.b.c.d.e.f.com/1/2/3/",
    ]);
  });

  it("deduplicates when the path is itself a prefix", () => {
    expect(expressions("http://b.com/")).toEqual(["b.com/"]);
  });
});

describe("hashing", () => {
  it("computes SHA-256 and the 4-byte base64 prefix", () => {
    // SHA-256("abc"), FIPS 180-2 test vector.
    const hash = fullHash("abc");
    expect(hash.toString("hex")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(hashPrefix(hash)).toBe("ungWvw==");
    expect(Buffer.from(hashPrefix(hash), "base64")).toHaveLength(4);
  });
});
