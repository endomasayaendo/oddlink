// Shared helpers for the scripts in this folder.
// Node built-ins only: this runs before (and without) `pnpm install`.
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const WEB_DIR = join(ROOT, "apps", "web");
export const ENV_FILE = join(WEB_DIR, ".env");
export const ENV_EXAMPLE = join(WEB_DIR, ".env.example");

// The compose file hard-codes this name. ODDLINK_DB_CONTAINER exists only so the container-state
// branches in bootstrap/stop can be exercised against a throwaway container; it does not rename the
// one that `pnpm db:up` creates.
export const DB_CONTAINER = process.env.ODDLINK_DB_CONTAINER || "oddlink-db";

// Where `pnpm bootstrap` records the process that runs the dev server, so `pnpm stop` can find it.
// ODDLINK_DEV_PID_FILE exists only so tests do not touch the record of a real dev server.
export const DEV_PID_FILE =
  process.env.ODDLINK_DEV_PID_FILE || join(ROOT, "node_modules", ".cache", "oddlink", "dev-server.json");

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
export function capture(command, args, { env } = {}) {
  const [file, argv, shell] = spawnArgs(command, args);
  const result = spawnSync(file, argv, {
    cwd: ROOT,
    encoding: "utf8",
    shell,
    env: env ? { ...process.env, ...env } : process.env,
  });
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

/**
 * Whether the Docker daemon answers: "ok", "not-installed" (no `docker` command) or "unreachable"
 * (installed but not running, or this user cannot reach it), with the daemon's error output.
 */
export function dockerStatus() {
  const result = capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (result.error?.code === "ENOENT") return { status: "not-installed", stderr: "" };
  if (result.code !== 0) return { status: "unreachable", stderr: result.stderr.trim() };
  return { status: "ok", stderr: "" };
}

/** The container's state ("running", "exited", "created", ...), or null if it does not exist. */
export function containerState(name = DB_CONTAINER) {
  const result = capture("docker", ["container", "inspect", "--format", "{{.State.Status}}", name]);
  if (result.code === 0) return result.stdout.trim();
  if (/no such/i.test(result.stderr)) return null;
  die(`Could not inspect the \`${name}\` container.`, result.stderr.trim());
}

/**
 * A running process's start time and command line as `ps` reports them, or null if the process
 * does not exist or `ps` is unavailable (Windows). LC_ALL=C keeps the start-time format the same
 * whichever locale the writer and the reader of the record run in.
 */
export function processInfo(pid) {
  if (isWindows) return null;
  const result = capture("ps", ["-o", "lstart=,command=", "-p", String(pid)], { env: { LC_ALL: "C" } });
  if (result.code !== 0) return null;
  // `lstart` is a fixed five-field date ("Mon Nov 16 09:30:00 2026"); the command line follows it.
  const match = result.stdout.trim().match(/^(\S+\s+\S+\s+\d+\s+[\d:]+\s+\d+)\s+(.*)$/s);
  return match ? { started: match[1], command: match[2] } : null;
}

/** Records this process as the one running the dev server. Does nothing where `ps` is unavailable. */
export function writeDevRecord() {
  const self = processInfo(process.pid);
  if (!self) return;
  mkdirSync(dirname(DEV_PID_FILE), { recursive: true });
  writeFileSync(DEV_PID_FILE, `${JSON.stringify({ pid: process.pid, started: self.started })}\n`);
}

/** The recorded dev-server process, or null if there is no record or it cannot be parsed. */
export function readDevRecord() {
  try {
    const record = JSON.parse(readFileSync(DEV_PID_FILE, "utf8"));
    return Number.isInteger(record?.pid) && record.pid > 0 && typeof record.started === "string" ? record : null;
  } catch {
    return null;
  }
}

/** Removes the record, but only if it still names `pid` (another run may have replaced it since). */
export function removeDevRecord(pid) {
  if (pid !== undefined && readDevRecord()?.pid !== pid) return;
  rmSync(DEV_PID_FILE, { force: true });
}
