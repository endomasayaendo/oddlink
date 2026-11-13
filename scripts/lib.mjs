// Shared helpers for scripts/bootstrap.mjs and scripts/verify.mjs.
// Node built-ins only: this runs before (and without) `pnpm install`.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const WEB_DIR = join(ROOT, "apps", "web");
export const ENV_FILE = join(WEB_DIR, ".env");
export const ENV_EXAMPLE = join(WEB_DIR, ".env.example");

const isWindows = process.platform === "win32";

export function info(message) {
  console.log(message);
}

export function step(message) {
  console.log(`\n▶ ${message}`);
}

export function ok(message) {
  console.log(`✔ ${message}`);
}

export function warn(message) {
  console.warn(`! ${message}`);
}

/** Prints an error (and an optional hint) and exits non-zero. */
export function die(message, hint) {
  console.error(`\n✖ ${message}`);
  if (hint) console.error(`\n${hint}`);
  process.exit(1);
}

/**
 * `pnpm` is a `.cmd` shim on Windows, which Node can only spawn through a shell. Passing an args
 * array together with `shell: true` triggers DEP0190 on Node 24+, so on Windows the command line is
 * joined here instead. That is safe because every pnpm argument in these scripts is a fixed literal.
 */
function spawnArgs(command, args) {
  return isWindows && command === "pnpm"
    ? [[command, ...args].join(" "), [], true]
    : [command, args, false];
}

/** Runs a command with inherited stdio and resolves with its exit status. */
export function run(command, args, { env, onChild } = {}) {
  return new Promise((resolve) => {
    const [file, argv, shell] = spawnArgs(command, args);
    const child = spawn(file, argv, {
      cwd: ROOT,
      stdio: "inherit",
      env: env ? { ...process.env, ...env } : process.env,
      shell,
    });
    onChild?.(child);
    child.on("error", (error) => {
      console.error(`Could not run \`${command}\`: ${error.message}`);
      resolve({ code: 127, signal: null });
    });
    child.on("close", (code, signal) => resolve({ code, signal }));
  });
}

export const pnpm = (args, options) => run("pnpm", args, options);

/** Runs a short command and captures its output. Never throws. */
export function capture(command, args) {
  const [file, argv, shell] = spawnArgs(command, args);
  const result = spawnSync(file, argv, { cwd: ROOT, encoding: "utf8", shell });
  return {
    code: result.status,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    error: result.error,
  };
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Reads `apps/web/.env` as a plain key/value object (empty if the file does not exist). */
export function readWebEnv() {
  if (!existsSync(ENV_FILE)) return {};
  return parseEnv(readFileSync(ENV_FILE, "utf8"));
}

/** Resolves true if something accepts TCP connections on host:port within the timeout. */
export function canConnect(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const finish = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}
