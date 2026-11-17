import { describe, expect, it } from "vitest";
import { parseHistory } from "@/ui/links/use-history";

const entry = (shortCode: string, extra: Record<string, unknown> = {}) => ({
  shortCode,
  shortUrl: `http://localhost:3000/${shortCode}`,
  originalUrl: "https://example.com",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

describe("parseHistory", () => {
  it("keeps valid entries in order, including extra fields", () => {
    const entries = [entry("a-b"), entry("c-d", { note: "kept" })];
    expect(parseHistory(JSON.stringify(entries))).toEqual(entries);
  });

  it("drops malformed entries", () => {
    const raw = JSON.stringify([
      entry("a-b"),
      null,
      "a-b",
      42,
      [],
      {},
      { ...entry("c-d"), shortCode: undefined },
      { ...entry("e-f"), shortCode: "" },
      { ...entry("g-h"), shortUrl: 1 },
      { ...entry("i-j"), originalUrl: null },
      entry("k-l"),
    ]);
    expect(parseHistory(raw)).toEqual([entry("a-b"), entry("k-l")]);
  });

  it("keeps only the first entry for a duplicated shortCode", () => {
    const first = entry("a-b", { originalUrl: "https://first.example" });
    const raw = JSON.stringify([first, entry("c-d"), entry("a-b", { originalUrl: "https://second.example" })]);
    expect(parseHistory(raw)).toEqual([first, entry("c-d")]);
  });

  it("returns an empty list for a non-JSON value", () => {
    expect(parseHistory("{not json")).toEqual([]);
  });

  it("returns an empty list for missing or non-array values", () => {
    expect(parseHistory(null)).toEqual([]);
    expect(parseHistory("")).toEqual([]);
    expect(parseHistory('{"shortCode":"a-b"}')).toEqual([]);
  });
});
