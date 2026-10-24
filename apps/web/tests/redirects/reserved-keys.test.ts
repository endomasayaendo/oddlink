import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { RESERVED_KEYS } from "@/lib/middleware/utils/is-reserved-key";

const appDir = fileURLToPath(new URL("../../app", import.meta.url));

// Metadata files in app/ and the URL each one is served at.
const METADATA_ROUTES: [RegExp, (name: string) => string][] = [
  [/^favicon\.ico$/, () => "favicon.ico"],
  [/^robots\.(txt|ts|js)$/, () => "robots.txt"],
  [/^sitemap\.(xml|ts|js)$/, () => "sitemap.xml"],
  [/^manifest\.(json|webmanifest|ts|js)$/, () => "manifest.webmanifest"],
  [/^(icon|apple-icon)\.\w+$/, (name) => name],
];

// Top-level entries in app/ that Next serves at a single-segment URL.
function singleSegmentRoutes(): string[] {
  return readdirSync(appDir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isDirectory()) {
      if (/^[[(@_]/.test(entry.name)) return []; // dynamic, group, slot or private folders
      const files = readdirSync(`${appDir}/${entry.name}`);
      return files.some((f) => /^(page|route)\.(tsx?|jsx?)$/.test(f)) ? [entry.name] : [];
    }
    const metadata = METADATA_ROUTES.find(([pattern]) => pattern.test(entry.name));
    return metadata ? [metadata[1](entry.name)] : [];
  });
}

describe("RESERVED_KEYS", () => {
  it("covers every single-segment route in app/, so the proxy never hides a page", () => {
    const routes = singleSegmentRoutes();
    expect(routes).toEqual(expect.arrayContaining(["not-found", "favicon.ico"]));
    for (const route of routes) expect(RESERVED_KEYS).toContain(route);
  });
});
