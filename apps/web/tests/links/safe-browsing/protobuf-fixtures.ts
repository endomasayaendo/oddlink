// Test helpers for the Safe Browsing v5 protobuf responses (see lib/links/safe-browsing/protobuf.ts).

/**
 * Real hashes:search responses, captured 2026-11-13 with the default (protobuf) output.
 * - phishing: prefix 771MOg== (testsafebrowsing.appspot.com/s/phishing.html) → SOCIAL_ENGINEERING, 300s
 * - malware: prefix WwuJdQ== (testsafebrowsing.appspot.com/s/malware.html) → POTENTIALLY_HARMFUL_APPLICATION + MALWARE, 300s
 * - noMatch: any prefix with no match (here c9mG4A==, example.com/) → only cache_duration 300s
 */
export const CAPTURED = {
  phishing: hex(
    "0a260a20efbd4c3ab44f327eb13ca942ad7c7f0ab47ec260a4d0b8051684a01b2ef3522012020802120308ac02",
  ),
  malware: hex(
    "0a2a0a205b0b89750c78f233fee25c6be32d928fcd805a8c5455c2110d29353c2f517fee1202080412020801120308ac02",
  ),
  noMatch: hex("120308ac02"),
};

export function hex(value: string): Uint8Array {
  return new Uint8Array(Buffer.from(value.replace(/\s+/g, ""), "hex"));
}

export const ThreatType = {
  THREAT_TYPE_UNSPECIFIED: 0,
  MALWARE: 1,
  SOCIAL_ENGINEERING: 2,
  UNWANTED_SOFTWARE: 3,
  POTENTIALLY_HARMFUL_APPLICATION: 4,
} as const;
export const ThreatAttribute = { THREAT_ATTRIBUTE_UNSPECIFIED: 0, CANARY: 1, FRAME_ONLY: 2 } as const;

export function varint(value: number | bigint): Uint8Array {
  let v = BigInt.asUintN(64, BigInt(value));
  const out: number[] = [];
  do {
    const byte = Number(v & 0x7fn);
    v >>= 7n;
    out.push(v > 0n ? byte | 0x80 : byte);
  } while (v > 0n);
  return Uint8Array.from(out);
}

const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));
const tag = (field: number, wireType: number) => varint((field << 3) | wireType);
export const varintField = (field: number, value: number | bigint) => concat(tag(field, 0), varint(value));
export const lenField = (field: number, payload: Uint8Array) => concat(tag(field, 2), varint(payload.length), payload);

export type DetailSpec = { threatType: number; attributes?: number[]; packed?: boolean };
export type FullHashSpec = { fullHash: Buffer; details?: DetailSpec[] };

/** Encodes a SearchHashesResponse the way the server does (fields in number order). */
export function encodeResponse({
  fullHashes = [],
  cacheSeconds,
  cacheNanos,
}: { fullHashes?: FullHashSpec[]; cacheSeconds?: number | bigint; cacheNanos?: number } = {}): Uint8Array {
  const parts = fullHashes.map(({ fullHash, details = [] }) =>
    lenField(1, concat(lenField(1, new Uint8Array(fullHash)), ...details.map((d) => lenField(2, encodeDetail(d))))),
  );
  if (cacheSeconds !== undefined || cacheNanos !== undefined) {
    const duration = concat(
      ...(cacheSeconds ? [varintField(1, cacheSeconds)] : []),
      ...(cacheNanos ? [varintField(2, cacheNanos)] : []),
    );
    parts.push(lenField(2, duration));
  }
  return concat(...parts);
}

function encodeDetail({ threatType, attributes = [], packed = true }: DetailSpec): Uint8Array {
  const parts = threatType ? [varintField(1, threatType)] : [];
  if (attributes.length > 0) {
    if (packed) parts.push(lenField(2, concat(...attributes.map((a) => varint(a)))));
    else parts.push(...attributes.map((a) => varintField(2, a)));
  }
  return concat(...parts);
}
