import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function readText(path: string): string {
  return readFileSync(`${repoRoot}${path}`, "utf8");
}

function readEnginesNode(path: string): string {
  const node = JSON.parse(readText(path)).engines?.node;
  if (typeof node !== "string") throw new Error(`${path} has no engines.node`);
  return node;
}

/**
 * Whether a range made of `^X.Y.Z`, `X.x` and `>=X.Y.Z` alternatives (joined by `||`) admits some
 * version of the given major. Any other form throws, so a new shape gets an explicit rule here.
 */
function rangeAdmitsMajor(range: string, major: number): boolean {
  return range.split("||").some((part) => {
    const alternative = part.trim();
    const pinned = /^(?:\^|~)?(\d+)(?:\.(?:x|\d+)){0,2}$/.exec(alternative);
    if (pinned) return Number(pinned[1]) === major;
    const atLeast = /^>=\s*(\d+)(?:\.\d+){0,2}$/.exec(alternative);
    if (atLeast) return major >= Number(atLeast[1]);
    throw new Error(`Unsupported engines.node alternative: "${alternative}"`);
  });
}

describe("Node.js version", () => {
  const nvmrcMajor = Number(/^v?(\d+)/.exec(readText(".nvmrc").trim())?.[1]);

  it(".nvmrc names a major version", () => {
    expect(Number.isInteger(nvmrcMajor)).toBe(true);
  });

  it("apps/web pins engines.node to exactly the .nvmrc major", () => {
    // A single `N.x` major: an open range such as `>=N` lets the host move to a newer major.
    expect(readEnginesNode("apps/web/package.json")).toBe(`${nvmrcMajor}.x`);
  });

  it("the root engines.node range admits the .nvmrc major", () => {
    expect(rangeAdmitsMajor(readEnginesNode("package.json"), nvmrcMajor)).toBe(true);
  });

  it("@types/node in apps/web matches the .nvmrc major", () => {
    const types = JSON.parse(readText("apps/web/package.json")).devDependencies["@types/node"];
    expect(/^\D*(\d+)/.exec(types)?.[1]).toBe(String(nvmrcMajor));
  });

  it("rangeAdmitsMajor handles the supported forms", () => {
    expect(rangeAdmitsMajor("^22.12.0 || ^24.0.0 || >=26.0.0", 24)).toBe(true);
    expect(rangeAdmitsMajor("^22.12.0 || ^24.0.0 || >=26.0.0", 23)).toBe(false);
    expect(rangeAdmitsMajor("26.x", 26)).toBe(true);
    expect(rangeAdmitsMajor("26.x", 24)).toBe(false);
    expect(() => rangeAdmitsMajor("<27", 26)).toThrow();
  });
});
