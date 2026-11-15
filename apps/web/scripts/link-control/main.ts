import { type ControlResult, deleteLink, disableLink, enableLink } from "@/lib/links/link-control";
import { type Command, describeResult, EXIT, type ExitCode, exitCodeFor, parseArgs, USAGE } from "./args";

export type CliIo = {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  /** Whether a person can answer the delete confirmation prompt. */
  interactive: boolean;
  /** Asks one question and resolves with the answer; rejects if input is closed or interrupted. */
  prompt: (question: string) => Promise<string>;
};

const OPERATOR = { actor: "operator" } as const;

const ACTIONS: Record<Command, (shortCode: string) => Promise<ControlResult>> = {
  disable: (code) => disableLink(code, OPERATOR),
  enable: (code) => enableLink(code, OPERATOR),
  delete: (code) => deleteLink(code, OPERATOR),
};

/**
 * Runs one operator command and returns the exit code. Prints one line per outcome and never the
 * destination URL or connection details. Does not close the database pool; the caller does.
 */
export async function main(argv: readonly string[], io: CliIo): Promise<ExitCode> {
  const args = parseArgs(argv);
  if (args.kind === "help") {
    io.stdout(USAGE);
    return EXIT.ok;
  }
  if (args.kind === "usage_error") {
    io.stderr(`error: ${args.message}`);
    io.stderr(USAGE);
    return EXIT.usage;
  }

  const { command, shortCode, yes } = args;
  if (command === "delete" && !yes) {
    if (!io.interactive) {
      io.stderr("refused: delete is irreversible; pass --yes when not running in a terminal");
      return EXIT.usage;
    }
    let answer: string;
    try {
      answer = await io.prompt(
        `Deleting "${shortCode}" is irreversible (its URL and access logs are removed).\nType the short code to confirm: `,
      );
    } catch {
      answer = "";
    }
    if (answer.trim() !== shortCode) {
      io.stderr(`aborted: confirmation did not match, nothing was deleted: ${shortCode}`);
      return EXIT.failed;
    }
  }

  let result: ControlResult;
  try {
    result = await ACTIONS[command](shortCode);
  } catch (err) {
    // Only the error code: pg messages and error objects can carry host and connection details.
    const code = (err as { code?: unknown } | null)?.code;
    io.stderr(`error: the database operation failed${typeof code === "string" ? ` (${code})` : ""}`);
    return EXIT.failed;
  }

  const { stream, line } = describeResult(command, shortCode, result);
  io[stream](line);
  return exitCodeFor(result);
}
