import { describe, expect, it } from "vitest";
import { clientKey, getClientIp, normalizeIp } from "@/lib/rate-limit/client-key";

const headers = (init: Record<string, string>) => new Headers(init);

describe("getClientIp", () => {
  it("prefers x-real-ip over x-forwarded-for", () => {
    expect(getClientIp(headers({ "x-real-ip": "203.0.113.7", "x-forwarded-for": "198.51.100.1" }))).toBe("203.0.113.7");
  });

  it("falls back to the first x-forwarded-for entry", () => {
    expect(getClientIp(headers({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1, 10.0.0.2" }))).toBe("198.51.100.1");
  });

  it("is null without either header, or when the value is not an address", () => {
    expect(getClientIp(headers({}))).toBeNull();
    expect(getClientIp(headers({ "x-real-ip": "not-an-ip" }))).toBeNull();
    expect(getClientIp(headers({ "x-forwarded-for": "unknown, 198.51.100.1" }))).toBeNull();
    expect(getClientIp(headers({ "x-forwarded-for": "" }))).toBeNull();
  });
});

describe("normalizeIp", () => {
  it("keeps IPv4 as-is", () => {
    expect(normalizeIp("192.0.2.10")).toBe("192.0.2.10");
  });

  it("turns IPv4-mapped IPv6 into IPv4", () => {
    expect(normalizeIp("::ffff:192.0.2.10")).toBe("192.0.2.10");
    expect(normalizeIp("::FFFF:c000:020a")).toBe("192.0.2.10");
    expect(normalizeIp("0:0:0:0:0:ffff:192.0.2.10")).toBe("192.0.2.10");
  });

  it("buckets IPv6 to its /64 in full form", () => {
    const bucket = "2001:0db8:0001:0002::/64";
    expect(normalizeIp("2001:db8:1:2::1")).toBe(bucket);
    expect(normalizeIp("2001:DB8:1:2:ffff:eeee:dddd:cccc")).toBe(bucket);
    expect(normalizeIp("[2001:db8:1:2::abcd]")).toBe(bucket);
    expect(normalizeIp("2001:db8:1:3::1")).not.toBe(bucket);
    expect(normalizeIp("::1")).toBe("0000:0000:0000:0000::/64");
    expect(normalizeIp("fe80::1%eth0")).toBe("fe80:0000:0000:0000::/64");
  });

  it.each(["", "unknown", "256.1.1.1", "1.2.3", "2001:db8::1::2", "203.0.113.7:443", "gggg::1"])("rejects %j", (value) => {
    expect(normalizeIp(value)).toBeNull();
  });
});

describe("clientKey", () => {
  const secret = "a".repeat(32);

  it("is a deterministic 64-character hex HMAC", () => {
    const key = clientKey("192.0.2.10", secret);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(clientKey("192.0.2.10", secret)).toBe(key);
    expect(clientKey("192.0.2.11", secret)).not.toBe(key);
  });

  it("differs by secret", () => {
    expect(clientKey("192.0.2.10", secret)).not.toBe(clientKey("192.0.2.10", "b".repeat(32)));
  });

  it("puts clients without an address in one shared bucket", () => {
    expect(clientKey(null, secret)).toBe(clientKey(null, secret));
    expect(clientKey(null, secret)).not.toBe(clientKey("192.0.2.10", secret));
  });

  it("never contains the address", () => {
    for (const ip of ["192.0.2.10", "2001:0db8:0001:0002::/64"]) {
      const key = clientKey(ip, secret);
      expect(key).not.toContain(ip);
      expect(key).not.toContain(ip.replaceAll(".", ""));
    }
  });
});
