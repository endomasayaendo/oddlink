import type { ControlResult } from "@/lib/links/link-control";
import { isPossibleShortCode } from "@/lib/middleware/utils/is-possible-short-code";

export const COMMANDS = ["disable", "enable", "delete"] as const;
export type Command = (typeof COMMANDS)[number];

/** 0: done or already in that state. 1: the link could not be changed. 2: bad invocation. */
export const EXIT = { ok: 0, failed: 1, usage: 2 } as const;
export type ExitCode = (typeof EXIT)[keyof typeof EXIT];

export const USAGE = [
  "Usage: pnpm --filter web link:<disable|enable|delete> [--yes] <short-code | short-url>",
  "  <short-url>  a full short link such as http://localhost:3000/golden-clock-whispers;",
  "               /<code>, /<code>+, /analytics/<code> or /preview/<code> (the host is ignored)",
  "  --yes, -y    delete only: skip the confirmation prompt (required without a terminal)",
].join("\n");

export type ParsedArgs =
  | { kind: "run"; command: Command; shortCode: string; yes: boolean }
  | { kind: "help" }
  | { kind: "usage_error"; message: string };

/** Parses `<command> [--yes|-y] <code>`; options may come before or after the code, `--` ends them. */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const [command, ...rest] = argv;
  if (command === "--help" || command === "-h") return { kind: "help" };
  if (!isCommand(command)) return usageError(`unknown command: ${command ?? "(none)"}`);

  let yes = false;
  const positional: string[] = [];
  let optionsEnded = false;
  for (const arg of rest) {
    if (!optionsEnded && arg === "--") optionsEnded = true;
    else if (!optionsEnded && (arg === "--help" || arg === "-h")) return { kind: "help" };
    else if (!optionsEnded && (arg === "--yes" || arg === "-y")) yes = true;
    else if (!optionsEnded && arg.startsWith("-") && arg.length > 1) return usageError(`unknown option: ${arg}`);
    else positional.push(arg);
  }

  if (yes && command !== "delete") return usageError("--yes only applies to delete");
  if (positional.length === 0) return usageError("missing short code");
  if (positional.length > 1) return usageError("expected exactly one short code");

  const shortCode = extractShortCode(positional[0]);
  if (shortCode === null) return usageError("not a valid short code or short URL");
  return { kind: "run", command, shortCode, yes };
}

/**
 * Accepts a bare short code or a pasted http(s) short URL. A URL must have one of the path shapes
 * the app serves for a link: `/code`, `/code+` (preview), `/analytics/code` or `/preview/code`; the
 * code segment is percent-decoded, and the preview `+` is dropped only from the single-segment
 * shape, as the app does. The host, query and fragment are ignored. Returns null when the result can
 * never be a short code, including any bare argument containing `/` (a short code is a single path
 * segment).
 */
export function extractShortCode(input: string): string | null {
  const trimmed = input.trim();
  let code = trimmed;
  if (/^https?:\/\//i.test(trimmed)) {
    let url: URL;
    try {
      url = new URL(trimmed);
    } catch {
      return null;
    }
    const segments = url.pathname.split("/").filter(Boolean);
    const single = segments.length === 1;
    const prefixed = segments.length === 2 && (segments[0] === "analytics" || segments[0] === "preview");
    if (!single && !prefixed) return null;
    try {
      code = decodeURIComponent(segments.at(-1) ?? "");
    } catch {
      return null;
    }
    if (single && code.endsWith("+")) code = code.slice(0, -1);
  }
  return !code.includes("/") && isPossibleShortCode(code) ? code : null;
}

const DONE: Record<Command, { changed: string; unchanged: string }> = {
  disable: { changed: "disabled", unchanged: "already disabled" },
  enable: { changed: "enabled", unchanged: "already enabled (was not disabled)" },
  delete: { changed: "deleted", unchanged: "already deleted" },
};

/** One output line for a result. Successes go to stdout, failures to stderr. */
export function describeResult(
  command: Command,
  shortCode: string,
  result: ControlResult,
): { stream: "stdout" | "stderr"; line: string } {
  if (result.ok) {
    return { stream: "stdout", line: `${result.changed ? DONE[command].changed : DONE[command].unchanged}: ${shortCode}` };
  }
  const why = {
    not_found: "not found",
    deleted: `cannot ${command}, the link was deleted`,
    not_allowed: `not allowed to ${command}`,
  }[result.reason];
  return { stream: "stderr", line: `${why}: ${shortCode}` };
}

export function exitCodeFor(result: ControlResult): ExitCode {
  return result.ok ? EXIT.ok : EXIT.failed;
}

function isCommand(value: string | undefined): value is Command {
  return (COMMANDS as readonly (string | undefined)[]).includes(value);
}

function usageError(message: string): ParsedArgs {
  return { kind: "usage_error", message };
}
