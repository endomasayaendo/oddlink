import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Keeps every reader of url_mappings on lib/links/link-state.ts and keeps rows from
 * ever being deleted (a deleted link stays as a tombstone, so its phrase is never freed). A new file touching the table fails
 * here until it is added below, imports link-state, and has its rows in link-readers-matrix.test.ts.
 */

const ROOT = join(import.meta.dirname, "../..");
const SCANNED = ["app", "lib", "scripts", "proxy.ts"];
const MATRIX = readFileSync(join(import.meta.dirname, "link-readers-matrix.test.ts"), "utf8");

/** Files that read url_mappings, with the readers they contribute to the matrix. */
const READERS: Record<string, string[]> = {
  "lib/links/resolve-link.ts": ["resolveShortCode", "findActiveLink", "proxy /c", "proxy HEAD /c"],
  "lib/links/get-link-preview.ts": ["getLinkPreview", "proxy /c+", "proxy /preview/c"],
  "lib/analytics/get-analytics.ts": ["getAnalytics"],
};

/** Files that may name the table without reading link state. */
const EXEMPT: Record<string, string> = {
  "lib/db/schema.ts": "defines the table",
  "lib/links/link-state.ts": "defines the state; getLinkState backs `proxy /c` misses and `proxy /analytics/c`",
  "lib/links/issue-link.ts": "only INSERTs new (active) rows and never reads state",
  "lib/links/link-control.ts": "the only writer of state (disable, enable, tombstone); rules pinned by link-control.test.ts",
};

function sourceFiles(path: string): string[] {
  const full = join(ROOT, path);
  if (!existsSync(full)) return [];
  if (statSync(full).isFile()) return /\.(ts|tsx|mts|mjs|js)$/.test(path) ? [path] : [];
  return readdirSync(full).flatMap((name) => sourceFiles(join(path, name)));
}

const files = SCANNED.flatMap(sourceFiles).map((file) => ({
  file: relative(ROOT, join(ROOT, file)),
  source: readFileSync(join(ROOT, file), "utf8"),
}));

describe("url_mappings readers registry", () => {
  it("scans the app", () => {
    expect(files.map((f) => f.file)).toContain("lib/links/resolve-link.ts");
  });

  it("lists every file that touches url_mappings", () => {
    const touching = files.filter((f) => /\burlMappings\b|\burl_mappings\b/.test(f.source)).map((f) => f.file);
    expect(touching.sort()).toEqual([...Object.keys(READERS), ...Object.keys(EXEMPT)].sort());
  });

  it.each(Object.keys(READERS))("%s decides state through link-state", (file) => {
    expect(files.find((f) => f.file === file)?.source).toMatch(/from "@\/lib\/links\/link-state"/);
  });

  it.each(Object.values(READERS).flat())("matrix covers %s", (reader) => {
    expect(MATRIX).toContain(`"${reader}"`);
  });

  it("never deletes a url_mappings row", () => {
    const deleting = files.filter(
      (f) => /DELETE\s+FROM\s+"?url_mappings"?/i.test(f.source) || /\.delete\(\s*urlMappings\b/.test(f.source),
    );
    expect(deleting.map((f) => f.file)).toEqual([]);
  });
});
