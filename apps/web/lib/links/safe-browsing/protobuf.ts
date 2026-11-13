/**
 * A minimal decoder for the one message we read: `SearchHashesResponse` from
 * google/security/safebrowsing/v5/safebrowsing.proto (googleapis@15c2796):
 *
 *   message SearchHashesResponse { repeated FullHash full_hashes = 1; google.protobuf.Duration cache_duration = 2; }
 *   message FullHash { bytes full_hash = 1; repeated FullHashDetail full_hash_details = 2; }
 *   message FullHashDetail { ThreatType threat_type = 1; repeated ThreatAttribute attributes = 2; }
 *   message Duration { int64 seconds = 1; int32 nanos = 2; }
 *
 * The API's `$alt=json` is rejected for hashes:search ("Unsupported Output Format"), hence this.
 * Unknown fields are skipped. Malformed input (truncation, overlong varints, groups, a known field
 * with the wrong wire type) makes the whole response invalid: `decode` returns null, never throws.
 */

/** Enum names by number. Unknown numbers decode to `UNRECOGNIZED_<n>`, which no caller acts on. */
const THREAT_TYPES = [
  "THREAT_TYPE_UNSPECIFIED",
  "MALWARE",
  "SOCIAL_ENGINEERING",
  "UNWANTED_SOFTWARE",
  "POTENTIALLY_HARMFUL_APPLICATION",
];
const THREAT_ATTRIBUTES = ["THREAT_ATTRIBUTE_UNSPECIFIED", "CANARY", "FRAME_ONLY"];

export type FullHashDetail = { threatType: string; attributes: string[] };
export type FullHash = { fullHash: Buffer; fullHashDetails: FullHashDetail[] };
export type SearchHashesResponse = {
  fullHashes: FullHash[];
  /** `cache_duration` in milliseconds; 0 when absent or not positive. */
  cacheDurationMs: number;
};

const VARINT = 0;
const I64 = 1;
const LEN = 2;
const I32 = 5;

class InvalidMessage extends Error {}

class Reader {
  private pos = 0;
  constructor(private readonly buf: Uint8Array) {}

  get done(): boolean {
    return this.pos >= this.buf.length;
  }

  /** Up to 64 bits; a varint longer than 10 bytes or overflowing 64 bits is invalid. */
  varint(): bigint {
    let result = 0n;
    for (let i = 0; i < 10; i++) {
      if (this.pos >= this.buf.length) throw new InvalidMessage("truncated varint");
      const byte = this.buf[this.pos++];
      if (i === 9 && byte > 1) throw new InvalidMessage("varint overflows 64 bits");
      result |= BigInt(byte & 0x7f) << BigInt(7 * i);
      if ((byte & 0x80) === 0) return result;
    }
    throw new InvalidMessage("varint too long");
  }

  bytes(): Uint8Array {
    const length = this.varint();
    if (length > BigInt(this.buf.length - this.pos)) throw new InvalidMessage("truncated field");
    const start = this.pos;
    this.pos += Number(length);
    return this.buf.subarray(start, this.pos);
  }

  /** Field number and wire type of the next field. */
  tag(): [field: number, wireType: number] {
    const tag = this.varint();
    const field = tag >> 3n;
    if (field === 0n || field > 0x1fffffffn) throw new InvalidMessage("bad field number");
    return [Number(field), Number(tag & 7n)];
  }

  skip(wireType: number) {
    switch (wireType) {
      case VARINT:
        this.varint();
        return;
      case LEN:
        this.bytes();
        return;
      case I64:
        return this.advance(8);
      case I32:
        return this.advance(4);
      default:
        // 3/4 are deprecated groups; 6/7 do not exist.
        throw new InvalidMessage(`unsupported wire type ${wireType}`);
    }
  }

  private advance(n: number) {
    if (this.pos + n > this.buf.length) throw new InvalidMessage("truncated field");
    this.pos += n;
  }
}

/** Reads every field of a message, handing known ones to `onField`; others are skipped. */
function readMessage(buf: Uint8Array, onField: (field: number, wireType: number, reader: Reader) => boolean) {
  const reader = new Reader(buf);
  while (!reader.done) {
    const [field, wireType] = reader.tag();
    if (!onField(field, wireType, reader)) reader.skip(wireType);
  }
}

function expect(wireType: number, expected: number) {
  if (wireType !== expected) throw new InvalidMessage("wrong wire type for a known field");
}

/** Proto3 enums are int32 varints; negative values are sign-extended to 10 bytes. */
function enumName(value: bigint, names: string[]): string {
  const n = Number(BigInt.asIntN(32, value));
  return names[n] ?? `UNRECOGNIZED_${n}`;
}

function decodeDetail(buf: Uint8Array): FullHashDetail {
  const detail: FullHashDetail = { threatType: THREAT_TYPES[0], attributes: [] };
  readMessage(buf, (field, wireType, reader) => {
    if (field === 1) {
      expect(wireType, VARINT);
      detail.threatType = enumName(reader.varint(), THREAT_TYPES);
      return true;
    }
    if (field === 2) {
      // Repeated enums may arrive packed (one LEN field) or one varint per value.
      if (wireType === LEN) {
        const packed = new Reader(reader.bytes());
        while (!packed.done) detail.attributes.push(enumName(packed.varint(), THREAT_ATTRIBUTES));
      } else {
        expect(wireType, VARINT);
        detail.attributes.push(enumName(reader.varint(), THREAT_ATTRIBUTES));
      }
      return true;
    }
    return false;
  });
  return detail;
}

function decodeFullHash(buf: Uint8Array): FullHash {
  const fullHash: FullHash = { fullHash: Buffer.alloc(0), fullHashDetails: [] };
  readMessage(buf, (field, wireType, reader) => {
    if (field === 1) {
      expect(wireType, LEN);
      fullHash.fullHash = Buffer.from(reader.bytes());
      return true;
    }
    if (field === 2) {
      expect(wireType, LEN);
      fullHash.fullHashDetails.push(decodeDetail(reader.bytes()));
      return true;
    }
    return false;
  });
  return fullHash;
}

/** Merges into `duration` because a repeated singular message field is merged, per the spec. */
function decodeDuration(buf: Uint8Array, duration: { seconds: bigint; nanos: bigint }) {
  readMessage(buf, (field, wireType, reader) => {
    if (field === 1 || field === 2) {
      expect(wireType, VARINT);
      const value = reader.varint();
      if (field === 1) duration.seconds = BigInt.asIntN(64, value);
      else duration.nanos = BigInt.asIntN(32, value);
      return true;
    }
    return false;
  });
}

export function decodeSearchHashesResponse(buf: Uint8Array): SearchHashesResponse | null {
  try {
    const fullHashes: FullHash[] = [];
    let duration: { seconds: bigint; nanos: bigint } | undefined;
    readMessage(buf, (field, wireType, reader) => {
      if (field === 1) {
        expect(wireType, LEN);
        fullHashes.push(decodeFullHash(reader.bytes()));
        return true;
      }
      if (field === 2) {
        expect(wireType, LEN);
        duration ??= { seconds: 0n, nanos: 0n };
        decodeDuration(reader.bytes(), duration);
        return true;
      }
      return false;
    });
    return { fullHashes, cacheDurationMs: duration ? toMillis(duration) : 0 };
  } catch (error) {
    if (error instanceof InvalidMessage) return null;
    throw error;
  }
}

function toMillis({ seconds, nanos }: { seconds: bigint; nanos: bigint }): number {
  const ms = seconds * 1000n + nanos / 1_000_000n;
  if (ms <= 0n) return 0;
  return ms > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(ms);
}
