import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { decodeShortCodeParam, shortCodeFromParams } from "@/lib/links/short-code-param";
import { parse } from "@/lib/middleware/utils/parse";
import { nextShortCodeParam } from "../utils/next-page-param";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };

const analyticsKeyOf = (pathname: string) => parse(new NextRequest(new URL(pathname, "http://localhost"))).analyticsKey;

describe("Next's page params", () => {
  // The helper decodes once because Next re-encodes the param; if that ever stops, `%25` codes
  // would be decoded twice, so this pins the behaviour of the installed Next version.
  it("arrive percent-encoded", () => {
    expect(nextShortCodeParam("/analytics/[shortCode]", "/analytics/%E3%81%AD%E3%81%93-%F0%9F%90%B1")).toBe(
      encodeURIComponent("ねこ-🐱"),
    );
    expect(nextShortCodeParam("/preview/[shortCode]", "/preview/50%25-off")).toBe("50%25-off");
  });
});

describe("decodeShortCodeParam", () => {
  it.each([
    ["non-ASCII", "/analytics/%E3%81%AD%E3%81%93-%F0%9F%90%B1", "ねこ-🐱"],
    ["accented", "/analytics/caf%C3%A9-code", "café-code"],
    ["ASCII", "/analytics/golden-clock-whispers", "golden-clock-whispers"],
    ["literal %", "/analytics/50%25-off", "50%-off"],
    ["encoded %25", "/analytics/50%2525-off", "50%25-off"],
  ])("gives the page the code the proxy looked up (%s)", (_, pathname, code) => {
    const decoded = decodeShortCodeParam(nextShortCodeParam("/analytics/[shortCode]", pathname));
    expect(decoded).toBe(code);
    expect(decoded).toBe(analyticsKeyOf(pathname));
  });

  it("returns null for a malformed escape", () => {
    expect(decodeShortCodeParam("%E3%81")).toBeNull();
    expect(decodeShortCodeParam("50%-off")).toBeNull();
  });
});

describe("shortCodeFromParams", () => {
  it("resolves to the decoded code", async () => {
    await expect(shortCodeFromParams(Promise.resolve({ shortCode: "%E3%81%AD%E3%81%93" }))).resolves.toBe("ねこ");
  });

  it("answers a malformed escape with notFound()", async () => {
    await expect(shortCodeFromParams(Promise.resolve({ shortCode: "%E3%81" }))).rejects.toMatchObject(NOT_FOUND);
  });
});
