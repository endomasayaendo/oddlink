import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { REROLL_WINDOW_MS, signRerollToken, verifyRerollToken } from "@/lib/links/reroll-token";

const secret = "test-signing-secret-0123456789abcdef";
const T0 = Date.UTC(2026, 10, 10, 12, 0, 0);
const at = (ms: number) => ({ secret, now: () => ms });

const token = signRerollToken({ id: 42, code: "silent-cat-dances" }, at(T0));
const [payload, signature] = token.split(".");

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
// What an attacker with the secret could produce; used to reach checks that run after the signature.
const signRaw = (rawPayload: string) =>
  `${rawPayload}.${createHmac("sha256", secret).update(rawPayload).digest("base64url")}`;

describe("signRerollToken / verifyRerollToken", () => {
  it("round-trips the claims with a 5-minute expiry", () => {
    expect(decode(payload)).toEqual({ id: 42, code: "silent-cat-dances", exp: T0 + REROLL_WINDOW_MS });
    expect(verifyRerollToken(token, at(T0 + 1000))).toEqual({
      ok: true,
      claims: { id: 42, code: "silent-cat-dances", exp: T0 + 5 * 60 * 1000 },
    });
  });

  it("is valid until just before the expiry and expired from it on", () => {
    expect(verifyRerollToken(token, at(T0 + REROLL_WINDOW_MS - 1)).ok).toBe(true);
    expect(verifyRerollToken(token, at(T0 + REROLL_WINDOW_MS))).toEqual({ ok: false, reason: "expired" });
    expect(verifyRerollToken(token, at(T0 + 60 * 60 * 1000))).toEqual({ ok: false, reason: "expired" });
  });

  it("uses LINK_SIGNING_SECRET by default", () => {
    const own = signRerollToken({ id: 1, code: "a-b" });
    expect(verifyRerollToken(own).ok).toBe(true);
    expect(verifyRerollToken(own, { secret })).toEqual({ ok: false, reason: "tampered" });
  });

  it("rejects a token signed with another secret", () => {
    const other = signRerollToken({ id: 42, code: "silent-cat-dances" }, { secret: "x".repeat(32), now: () => T0 });
    expect(verifyRerollToken(other, at(T0))).toEqual({ ok: false, reason: "tampered" });
  });

  it("rejects a tampered payload, even one that extends the expiry", () => {
    const claims = decode(payload);
    for (const changed of [
      { ...claims, id: 43 },
      { ...claims, code: "other-phrase" },
      { ...claims, exp: claims.exp + 60 * 60 * 1000 },
    ]) {
      expect(verifyRerollToken(`${encode(changed)}.${signature}`, at(T0))).toEqual({ ok: false, reason: "tampered" });
    }
  });

  it("checks the signature before the expiry", () => {
    const forged = `${encode({ ...decode(payload), id: 43 })}.${signature}`;
    expect(verifyRerollToken(forged, at(T0 + REROLL_WINDOW_MS * 2))).toEqual({ ok: false, reason: "tampered" });
  });

  it("rejects a tampered signature", () => {
    const flipped = Buffer.from(signature, "base64url");
    flipped[0] ^= 1;
    expect(verifyRerollToken(`${payload}.${flipped.toString("base64url")}`, at(T0))).toEqual({
      ok: false,
      reason: "tampered",
    });
    // Wrong length: truncated, or padded with an extra byte.
    expect(verifyRerollToken(`${payload}.${signature.slice(0, -4)}`, at(T0))).toEqual({ ok: false, reason: "tampered" });
    expect(verifyRerollToken(`${payload}.${signature}AAAA`, at(T0))).toEqual({ ok: false, reason: "tampered" });
  });

  it("accepts only the canonical spelling of the signature", () => {
    // 32 bytes is 43 base64url characters; the last one carries 2 unused bits.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const accepted = [...alphabet].filter((c) => verifyRerollToken(`${token.slice(0, -1)}${c}`, at(T0)).ok);
    expect(accepted).toEqual([token.at(-1)]);
  });

  it.each([
    ["undefined", undefined],
    ["null", null],
    ["a number", 42],
    ["an object", { token: "x" }],
    ["an empty string", ""],
    ["no dot", "abc"],
    ["three parts", "a.b.c"],
    ["an empty part", `${"x".repeat(10)}.`],
    ["non-base64url characters", "a+b/c=.d+e/f="],
    ["whitespace", " a.b "],
  ])("rejects %s as malformed", (_label, input) => {
    expect(verifyRerollToken(input, at(T0))).toEqual({ ok: false, reason: "malformed" });
  });

  it.each([
    ["not JSON", Buffer.from("not json").toString("base64url")],
    ["JSON null", encode(null)],
    ["a JSON string", encode("x")],
    ["a missing id", encode({ code: "a-b", exp: T0 + 1000 })],
    ["a non-integer id", encode({ id: 1.5, code: "a-b", exp: T0 + 1000 })],
    ["a string id", encode({ id: "1", code: "a-b", exp: T0 + 1000 })],
    ["a zero id", encode({ id: 0, code: "a-b", exp: T0 + 1000 })],
    ["an empty code", encode({ id: 1, code: "", exp: T0 + 1000 })],
    ["a missing exp", encode({ id: 1, code: "a-b" })],
    ["a string exp", encode({ id: 1, code: "a-b", exp: String(T0 + 1000) })],
  ])("rejects a correctly signed payload with %s as malformed", (_label, rawPayload) => {
    expect(verifyRerollToken(signRaw(rawPayload), at(T0))).toEqual({ ok: false, reason: "malformed" });
  });

  it("never throws, whatever the input", () => {
    const inputs: unknown[] = [
      undefined,
      Symbol("x"),
      () => token,
      ".",
      "..",
      "\u0000.\u0000",
      "💥.💥",
      `${payload}.${signature}.`,
      "a".repeat(100_000),
      `${"a".repeat(50_000)}.${"b".repeat(50_000)}`,
    ];
    for (const input of inputs) {
      expect(() => verifyRerollToken(input, at(T0))).not.toThrow();
      expect(verifyRerollToken(input, at(T0)).ok).toBe(false);
    }
  });
});
