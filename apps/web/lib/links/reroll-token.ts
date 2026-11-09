import { createHmac, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";

// Server-only: signs with LINK_SIGNING_SECRET.

/** How long after issuing a link its phrase can be rerolled. */
export const REROLL_WINDOW_MS = 5 * 60 * 1000;

export type RerollClaims = {
  /** url_mappings.id */
  id: number;
  /** The phrase the link has now; the reroll only applies while it still has it. */
  code: string;
  /** Expiry, in epoch milliseconds. */
  exp: number;
};

export type VerifyResult =
  | { ok: true; claims: RerollClaims }
  | { ok: false; reason: "malformed" | "tampered" | "expired" };

type Options = {
  /** Defaults to LINK_SIGNING_SECRET. */
  secret?: string;
  /** Epoch milliseconds; injectable for tests. */
  now?: () => number;
};

const SIGNATURE_BYTES = 32; // SHA-256
const BASE64URL = /^[A-Za-z0-9_-]+$/;

function signingSecret(): string {
  const secret = getEnv().LINK_SIGNING_SECRET;
  // Only `next build` tolerates a missing secret, and nothing is signed during the build.
  if (!secret) throw new Error("LINK_SIGNING_SECRET is not set");
  return secret;
}

const hmac = (secret: string, payload: string) => createHmac("sha256", secret).update(payload).digest();

/** Returns `payload.signature`, both base64url, valid for REROLL_WINDOW_MS from now. */
export function signRerollToken(
  { id, code }: Pick<RerollClaims, "id" | "code">,
  { secret = signingSecret(), now = Date.now }: Options = {},
): string {
  const claims: RerollClaims = { id, code, exp: now() + REROLL_WINDOW_MS };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${hmac(secret, payload).toString("base64url")}`;
}

/**
 * Checks the signature (in constant time) before reading the payload, then the expiry.
 * Never throws on any input; a missing secret is a configuration error and still throws.
 */
export function verifyRerollToken(token: unknown, { secret = signingSecret(), now = Date.now }: Options = {}): VerifyResult {
  try {
    if (typeof token !== "string") return { ok: false, reason: "malformed" };
    const parts = token.split(".");
    if (parts.length !== 2 || !parts.every((part) => BASE64URL.test(part))) return { ok: false, reason: "malformed" };
    const [payload, signature] = parts;

    const given = Buffer.from(signature, "base64url");
    // Node's decoder ignores the unused low bits of the last character, so several strings decode to
    // the same bytes. Accept only the canonical encoding, so each token has exactly one spelling.
    const canonical = given.toString("base64url") === signature;
    if (!canonical || given.length !== SIGNATURE_BYTES || !timingSafeEqual(given, hmac(secret, payload))) {
      return { ok: false, reason: "tampered" };
    }

    const claims = parseClaims(Buffer.from(payload, "base64url").toString("utf8"));
    if (!claims) return { ok: false, reason: "malformed" };
    if (now() >= claims.exp) return { ok: false, reason: "expired" };
    return { ok: true, claims };
  } catch {
    return { ok: false, reason: "malformed" };
  }
}

function parseClaims(json: string): RerollClaims | null {
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return null;
  }
  const { id, code, exp } = (value ?? {}) as Partial<Record<keyof RerollClaims, unknown>>;
  if (!Number.isSafeInteger(id) || (id as number) <= 0) return null;
  if (typeof code !== "string" || code === "") return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  return { id: id as number, code, exp };
}
