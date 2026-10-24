import { describe, expect, it } from "vitest";
import { originalUrlSchema } from "@/lib/zod/schemas/links";

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
});
