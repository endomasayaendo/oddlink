import { describe, expect, it } from "vitest";
import { fullHash } from "@/lib/links/safe-browsing/expressions";
import { decodeSearchHashesResponse } from "@/lib/links/safe-browsing/protobuf";
import {
  CAPTURED,
  encodeResponse,
  hex,
  lenField,
  ThreatAttribute,
  ThreatType,
  varint,
  varintField,
} from "./protobuf-fixtures";

const HASH = fullHash("phish.example.com/login/");
const concat = (...parts: Uint8Array[]) => new Uint8Array(Buffer.concat(parts));

describe("captured responses", () => {
  it("decodes the phishing test URL", () => {
    expect(decodeSearchHashesResponse(CAPTURED.phishing)).toEqual({
      fullHashes: [
        {
          fullHash: fullHash("testsafebrowsing.appspot.com/s/phishing.html"),
          fullHashDetails: [{ threatType: "SOCIAL_ENGINEERING", attributes: [] }],
        },
      ],
      cacheDurationMs: 300_000,
    });
  });

  it("decodes the malware test URL, with two details", () => {
    expect(decodeSearchHashesResponse(CAPTURED.malware)).toEqual({
      fullHashes: [
        {
          fullHash: fullHash("testsafebrowsing.appspot.com/s/malware.html"),
          fullHashDetails: [
            { threatType: "POTENTIALLY_HARMFUL_APPLICATION", attributes: [] },
            { threatType: "MALWARE", attributes: [] },
          ],
        },
      ],
      cacheDurationMs: 300_000,
    });
  });

  it("decodes a response with no match", () => {
    expect(decodeSearchHashesResponse(CAPTURED.noMatch)).toEqual({ fullHashes: [], cacheDurationMs: 300_000 });
  });

  it("decodes an empty body (every field omitted)", () => {
    expect(decodeSearchHashesResponse(new Uint8Array())).toEqual({ fullHashes: [], cacheDurationMs: 0 });
  });
});

describe("enums", () => {
  it.each(Object.entries(ThreatType))("threat type %s = %i", (name, value) => {
    const decoded = decodeSearchHashesResponse(encodeResponse({ fullHashes: [{ fullHash: HASH, details: [{ threatType: value }] }] }));
    expect(decoded?.fullHashes[0].fullHashDetails).toEqual([{ threatType: name, attributes: [] }]);
  });

  it("maps unknown and negative enum numbers to names nothing acts on", () => {
    const decoded = decodeSearchHashesResponse(
      encodeResponse({ fullHashes: [{ fullHash: HASH, details: [{ threatType: 99, attributes: [7, -1] }] }] }),
    );
    expect(decoded?.fullHashes[0].fullHashDetails).toEqual([
      { threatType: "UNRECOGNIZED_99", attributes: ["UNRECOGNIZED_7", "UNRECOGNIZED_-1"] },
    ]);
  });

  it.each([true, false])("reads repeated attributes packed=%s", (packed) => {
    const attributes = [ThreatAttribute.CANARY, ThreatAttribute.FRAME_ONLY, ThreatAttribute.THREAT_ATTRIBUTE_UNSPECIFIED];
    const decoded = decodeSearchHashesResponse(
      encodeResponse({ fullHashes: [{ fullHash: HASH, details: [{ threatType: ThreatType.MALWARE, attributes, packed }] }] }),
    );
    expect(decoded?.fullHashes[0].fullHashDetails[0].attributes).toEqual([
      "CANARY",
      "FRAME_ONLY",
      "THREAT_ATTRIBUTE_UNSPECIFIED",
    ]);
  });

  it("reads packed and unpacked attributes mixed in one detail", () => {
    const detail = concat(
      varintField(1, ThreatType.MALWARE),
      varintField(2, ThreatAttribute.CANARY),
      lenField(2, varint(ThreatAttribute.FRAME_ONLY)),
    );
    const body = lenField(1, concat(lenField(1, HASH), lenField(2, detail)));
    expect(decodeSearchHashesResponse(body)?.fullHashes[0].fullHashDetails[0].attributes).toEqual(["CANARY", "FRAME_ONLY"]);
  });
});

describe("cache_duration", () => {
  it.each([
    [{ cacheSeconds: 300 }, 300_000],
    [{ cacheSeconds: 3, cacheNanos: 500_000_000 }, 3_500],
    [{ cacheNanos: 999_999 }, 0],
    [{ cacheSeconds: -5 }, 0],
    [{ cacheSeconds: 2n ** 62n }, Number.MAX_SAFE_INTEGER],
    [{}, 0],
  ])("%o → %i ms", (duration, ms) => {
    expect(decodeSearchHashesResponse(encodeResponse(duration))?.cacheDurationMs).toBe(ms);
  });

  it("merges a duration sent in two parts, as proto3 merges repeated singular messages", () => {
    const body = concat(lenField(2, varintField(1, 2)), lenField(2, varintField(2, 250_000_000)));
    expect(decodeSearchHashesResponse(body)?.cacheDurationMs).toBe(2_250);
  });
});

describe("unknown fields are skipped", () => {
  it.each([
    ["varint", varintField(15, 12345)],
    ["length-delimited", lenField(15, hex("deadbeef"))],
    ["64-bit", concat(varint((15 << 3) | 1), hex("0102030405060708"))],
    ["32-bit", concat(varint((15 << 3) | 5), hex("01020304"))],
  ])("%s, at every level", (_label, unknown) => {
    const detail = concat(unknown, varintField(1, ThreatType.MALWARE), unknown);
    const hash = concat(unknown, lenField(1, HASH), lenField(2, detail), unknown);
    const duration = concat(unknown, varintField(1, 60), unknown);
    const body = concat(unknown, lenField(1, hash), lenField(2, duration), unknown);
    expect(decodeSearchHashesResponse(body)).toEqual({
      fullHashes: [{ fullHash: HASH, fullHashDetails: [{ threatType: "MALWARE", attributes: [] }] }],
      cacheDurationMs: 60_000,
    });
  });
});

describe("malformed input is invalid (null), never a throw", () => {
  it("every truncation of the captured phishing response", () => {
    for (let length = 1; length < CAPTURED.phishing.length; length++) {
      const truncated = CAPTURED.phishing.subarray(0, length);
      expect(() => decodeSearchHashesResponse(truncated)).not.toThrow();
      // Cutting exactly between two top-level fields leaves a valid (shorter) message.
      if (length !== 40) expect(decodeSearchHashesResponse(truncated), `length ${length}`).toBeNull();
    }
  });

  it.each([
    ["a varint longer than 10 bytes", hex("08 ffffffffffffffffffff01")],
    ["a varint overflowing 64 bits", hex("08 ffffffffffffffffff7f")],
    ["an unterminated varint", hex("08 ff")],
    ["a length beyond the end", hex("0a 05 0102")],
    ["a huge length", concat(hex("0a"), varint(2n ** 63n))],
    ["field number 0", hex("00 01")],
    ["a start group (wire type 3)", hex("7b")],
    ["an end group (wire type 4)", hex("7c")],
    ["wire type 6", hex("7e")],
    ["wire type 7", hex("7f")],
    ["a known field with the wrong wire type", varintField(1, 1)],
    ["a threat type sent as bytes", lenField(1, lenField(2, lenField(1, hex("01"))))],
    ["a broken packed attribute list", lenField(1, lenField(2, lenField(2, hex("ff"))))],
    ["a truncated 64-bit field", concat(varint((15 << 3) | 1), hex("0102"))],
    ["a truncated 32-bit field", concat(varint((15 << 3) | 5), hex("01"))],
    ["HTML", new TextEncoder().encode("<html>oops</html>")],
  ])("%s", (_label, body) => {
    expect(decodeSearchHashesResponse(body)).toBeNull();
  });
});
