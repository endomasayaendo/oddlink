import { describe, expect, it } from "vitest";
import { pointsAtOwnShortLinks } from "@/lib/links/url-safety";

const check = (target: string, base: string) => pointsAtOwnShortLinks(new URL(target), base);

describe("pointsAtOwnShortLinks", () => {
  describe("with a production origin", () => {
    const base = "https://oddlink.example";

    it.each([
      "https://oddlink.example/some-code",
      "https://oddlink.example",
      "https://ODDLINK.Example/some-code",
      "https://oddlink.example./some-code",
      "https://oddlink.example:443/some-code",
      "http://oddlink.example/some-code",
      "http://oddlink.example:80/some-code",
      "https://www.oddlink.example/some-code",
      "https://oddlink.example/a?b=c#d",
    ])("matches %s", (target) => {
      expect(check(target, base)).toBe(true);
    });

    it.each([
      "https://example.com/some-code",
      "https://oddlink.example.evil.example/some-code",
      "https://evil-oddlink.example/some-code",
      "https://api.oddlink.example/some-code",
      "https://oddlink.example:8443/some-code",
      "http://oddlink.example:8080/some-code",
      "https://oddlink.example.com/some-code",
    ])("does not match %s", (target) => {
      expect(check(target, base)).toBe(false);
    });
  });

  it("treats the bare name as the same site when the origin uses www.", () => {
    expect(check("https://oddlink.example/x", "https://www.oddlink.example")).toBe(true);
  });

  it("matches IDN hosts in Unicode and punycode form", () => {
    const base = "https://xn--r8jz45g.example";
    expect(check("https://例え.example/some-code", base)).toBe(true);
    expect(check("https://XN--R8JZ45G.example/some-code", base)).toBe(true);
    expect(check("https://例え.example/some-code", "https://例え.example")).toBe(true);
    expect(check("https://別.example/some-code", base)).toBe(false);
  });

  describe("on loopback", () => {
    const base = "http://localhost:3000";

    it.each([
      "http://localhost:3000/some-code",
      "https://localhost:3000/some-code",
      "http://127.0.0.1:3000/some-code",
      "http://0x7f.1:3000/some-code",
      "http://[::1]:3000/some-code",
      "http://app.localhost:3000/some-code",
    ])("matches %s", (target) => {
      expect(check(target, base)).toBe(true);
    });

    it.each(["http://localhost:4000/some-code", "http://localhost/some-code", "http://example.com:3000/x"])(
      "does not match %s",
      (target) => {
        expect(check(target, base)).toBe(false);
      },
    );
  });

  it("does not apply the www. rule to IP addresses", () => {
    expect(check("http://192.0.2.1/x", "http://192.0.2.1")).toBe(true);
    expect(check("http://192.0.2.2/x", "http://192.0.2.1")).toBe(false);
  });

  describe("with a path prefix", () => {
    const base = "https://example.com/go";

    it.each(["https://example.com/go", "https://example.com/go/", "https://example.com/go/some-code", "https://example.com/%67o/x"])(
      "matches %s",
      (target) => {
        expect(check(target, base)).toBe(true);
      },
    );

    it.each(["https://example.com/", "https://example.com/gone", "https://example.com/other/go/x"])(
      "does not match %s",
      (target) => {
        expect(check(target, base)).toBe(false);
      },
    );
  });
});
