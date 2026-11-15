import { describe, expect, it } from "vitest";
import { describeResult, EXIT, exitCodeFor, extractShortCode, parseArgs } from "@/scripts/link-control/args";

describe("extractShortCode", () => {
  it.each([
    ["golden-clock-whispers", "golden-clock-whispers"],
    ["  golden-clock-whispers\n", "golden-clock-whispers"],
    ["http://localhost:3000/heavy-fox-sings", "heavy-fox-sings"],
    ["https://oddlink.example/heavy-fox-sings/", "heavy-fox-sings"],
    ["https://oddlink.example/heavy-fox-sings+", "heavy-fox-sings"],
    ["https://oddlink.example/heavy-fox-sings%2B", "heavy-fox-sings"],
    ["https://oddlink.example/heavy-fox-sings?utm=x#top", "heavy-fox-sings"],
    ["https://oddlink.example/analytics/heavy-fox-sings", "heavy-fox-sings"],
    ["HTTPS://oddlink.example/caf%C3%A9-code", "café-code"],
  ])("%j -> %j", (input, expected) => {
    expect(extractShortCode(input)).toBe(expected);
  });

  it.each(["", "   ", "https://oddlink.example/", "https://oddlink.example/%E0%A4%A", "https://oddlink.example/a++", "robots.txt", "a".repeat(256), "ftp://x/abc", "heavy-fox/sings"])(
    "rejects %j",
    (input) => {
      expect(extractShortCode(input)).toBeNull();
    },
  );
});

describe("parseArgs", () => {
  it("parses a command and code", () => {
    expect(parseArgs(["disable", "heavy-fox"])).toEqual({ kind: "run", command: "disable", shortCode: "heavy-fox", yes: false });
  });

  it.each([
    [["delete", "--yes", "heavy-fox"]],
    [["delete", "heavy-fox", "-y"]],
    [["delete", "--yes", "--", "heavy-fox"]],
  ])("accepts --yes for delete: %j", (argv) => {
    expect(parseArgs(argv)).toEqual({ kind: "run", command: "delete", shortCode: "heavy-fox", yes: true });
  });

  it("takes the code from a pasted short URL", () => {
    expect(parseArgs(["enable", "http://localhost:3000/heavy-fox+"])).toMatchObject({ shortCode: "heavy-fox" });
  });

  it.each([["--help"], ["disable", "-h"]])("returns help for %j", (...argv) => {
    expect(parseArgs(argv)).toEqual({ kind: "help" });
  });

  it.each([
    [[], "unknown command: (none)"],
    [["purge", "x"], "unknown command: purge"],
    [["disable"], "missing short code"],
    [["disable", "a", "b"], "expected exactly one short code"],
    [["disable", "--force", "a"], "unknown option: --force"],
    [["enable", "--yes", "a"], "--yes only applies to delete"],
    [["disable", "robots.txt"], "not a valid short code or short URL"],
  ])("usage error for %j", (argv, message) => {
    expect(parseArgs(argv)).toEqual({ kind: "usage_error", message });
  });
});

describe("describeResult / exitCodeFor", () => {
  it.each([
    ["disable", { ok: true, changed: true }, "stdout", "disabled: c", EXIT.ok],
    ["disable", { ok: true, changed: false }, "stdout", "already disabled: c", EXIT.ok],
    ["enable", { ok: true, changed: true }, "stdout", "enabled: c", EXIT.ok],
    ["enable", { ok: true, changed: false }, "stdout", "already enabled (was not disabled): c", EXIT.ok],
    ["delete", { ok: true, changed: true }, "stdout", "deleted: c", EXIT.ok],
    ["delete", { ok: true, changed: false }, "stdout", "already deleted: c", EXIT.ok],
    ["disable", { ok: false, reason: "not_found" }, "stderr", "not found: c", EXIT.failed],
    ["enable", { ok: false, reason: "deleted" }, "stderr", "cannot enable, the link was deleted: c", EXIT.failed],
    ["enable", { ok: false, reason: "not_allowed" }, "stderr", "not allowed to enable: c", EXIT.failed],
  ] as const)("%s %j", (command, result, stream, line, code) => {
    expect(describeResult(command, "c", result)).toEqual({ stream, line });
    expect(exitCodeFor(result)).toBe(code);
  });
});
