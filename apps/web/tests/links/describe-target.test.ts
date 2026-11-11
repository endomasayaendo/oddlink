import { describe, expect, it } from "vitest";
import { describeTarget } from "@/lib/links/describe-target";

describe("describeTarget", () => {
  it("shows the host, port included", () => {
    expect(describeTarget(new URL("https://example.com:8443/a/b?c=d"))).toEqual({ host: "example.com:8443", insecure: false });
  });

  it("keeps an internationalized domain in punycode", () => {
    expect(describeTarget(new URL("https://аpple.com/")).host).toBe("xn--pple-43d.com");
  });

  it("flags plain http as not encrypted", () => {
    expect(describeTarget(new URL("http://example.com/")).insecure).toBe(true);
  });

  it("does not flag https", () => {
    expect(describeTarget(new URL("https://example.com/")).insecure).toBe(false);
  });
});
