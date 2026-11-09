import { describe, expect, it } from "vitest";
import { NO_USERINFO_MESSAGE, originalUrlSchema } from "@/lib/zod/schemas/links";

const parse = (value: unknown) => originalUrlSchema.safeParse(value);

describe("originalUrlSchema", () => {
  it.each(["https://example.com/path?q=1", "http://localhost:3000/x", "https://日本.jp/パス"])("accepts %s", (url) => {
    expect(parse(url).success).toBe(true);
  });

  it("trims surrounding whitespace", () => {
    expect(parse("  https://example.com  ").data).toBe("https://example.com");
  });

  it.each([undefined, null, "", "   "])("rejects blank input %j", (value) => {
    expect(parse(value).error?.issues[0].message).toBe("URL is required");
  });

  it.each(["not a url", "https://", "file:///etc/passwd", "ftp://example.com", "javascript:alert(1)", "jar:file:/x.jar!/"])(
    "rejects %s",
    (url) => {
      expect(parse(url).error?.issues[0].message).toBe("Must be a valid http or https URL");
    },
  );

  it("rejects URLs longer than 2048 characters", () => {
    expect(parse(`https://example.com/${"a".repeat(2048)}`).error?.issues[0].message).toBe("URL is too long");
  });

  describe("userinfo", () => {
    it.each([
      "https://google.com@evil.example",
      "https://user:pass@example.com",
      "https://:pass@example.com",
      "https://a%40b@example.com",
      "HTTPS://user@example.com",
    ])("rejects %s", (url) => {
      const result = parse(url);
      expect(result.success).toBe(false);
      expect(result.error?.issues[0].message).toBe(NO_USERINFO_MESSAGE);
    });

    it("states the message the API and form show", () => {
      expect(NO_USERINFO_MESSAGE).toBe("URLs with a username or password are not allowed");
    });

    // z.url() refuses these itself today (WHATWG would read them as userinfo URLs). Whichever
    // check catches them, they must stay rejected if zod's URL parsing ever changes.
    it.each(["https:/google.com@evil.example", "https:\\google.com@evil.example"])("rejects %s", (url) => {
      expect(parse(url).success).toBe(false);
    });

    it.each(["https://@example.com", "https://example.com/path@x", "https://example.com?x=a@b", "https://example.com#a@b"])(
      "accepts %s",
      (url) => {
        expect(parse(url).success).toBe(true);
      },
    );

    it("keeps the scheme error, and only that, for a non-http URL with userinfo", () => {
      const issues = parse("ftp://u@example.com").error?.issues;
      expect(issues).toHaveLength(1);
      expect(issues?.[0].message).toBe("Must be a valid http or https URL");
    });

    it("reports an invalid URL without throwing", () => {
      expect(() => parse("not a url")).not.toThrow();
      expect(parse("not a url").error?.issues).toHaveLength(1);
    });
  });
});
