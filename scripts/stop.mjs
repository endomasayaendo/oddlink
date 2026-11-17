// Stops what `pnpm bootstrap` started: `pnpm stop` (add `--keep-db` to leave Postgres running).
// The dev server is stopped only through the process `pnpm bootstrap` recorded, never by port or
// by name. The database container is stopped, not removed, so its data stays and `pnpm bootstrap`
// starts it again.
import {
  DB_CONTAINER,
  capture,
  containerState,
  die,
  dockerStatus,
  info,
  ok,
  processInfo,
  readDevRecord,
  removeDevRecord,
  sleep,
  step,
  warn,
} from "./lib.mjs";

const STOP_POLL_MS = 250;
const STOP_TIMEOUT_MS = 15_000;

const args = process.argv.slice(2);
const keepDb = args.includes("--keep-db");
const unknown = args.filter((arg) => arg !== "--keep-db");
if (unknown.length > 0) {
  die(`Unknown argument: ${unknown.join(" ")}`, "Usage: pnpm stop [--keep-db]");
}

/** True while the recorded process is still the same `pnpm bootstrap` run (guards against PID reuse). */
function isRecordedBootstrap(record) {
  const current = processInfo(record.pid);
  return current !== null && current.started === record.started && /\bbootstrap\.mjs\b/.test(current.command);
}

/** Resolves true once the process is gone, or false if it is still running at the deadline. */
async function waitForExit(record) {
  const deadline = Date.now() + STOP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (!isRecordedBootstrap(record)) return true;
    await sleep(STOP_POLL_MS);
  }
  return !isRecordedBootstrap(record);
}

/** Returns false if a dev server was found but did not stop. */
async function stopDevServer() {
  if (process.platform === "win32") {
    info("Stopping the dev server is not supported on Windows; press Ctrl+C in the terminal running it.");
    return true;
  }
  const record = readDevRecord();
  if (!record || !isRecordedBootstrap(record)) {
    removeDevRecord();
    info("No dev server started by `pnpm bootstrap` is running in this checkout.");
    return true;
  }
  info(`Stopping the dev server (pid ${record.pid})…`);
  // `pnpm bootstrap` forwards SIGTERM to `pnpm dev`, which stops turbo and Next.js with it.
  try {
    process.kill(record.pid, "SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
  if (await waitForExit(record)) {
    removeDevRecord(record.pid);
    ok("Dev server stopped.");
    return true;
  }
  warn(
    `The dev server (pid ${record.pid}) is still running after ${STOP_TIMEOUT_MS / 1000}s.\n` +
      `  Press Ctrl+C in the terminal running it, or run \`kill ${record.pid}\`.`,
  );
  return false;
}

function stopDatabase() {
  const docker = dockerStatus();
  if (docker.status === "not-installed") {
    info("Docker is not installed, so there is no database container to stop.");
    return;
  }
  if (docker.status === "unreachable") {
    info(
      "Could not reach the Docker daemon. If Docker is not running, the database is not running either.\n" +
        `  ${docker.stderr}`,
    );
    return;
  }
  const state = containerState();
  if (state === null) {
    info(`There is no \`${DB_CONTAINER}\` container; nothing to stop.`);
    return;
  }
  if (state !== "running" && state !== "restarting" && state !== "paused") {
    info(`\`${DB_CONTAINER}\` is already ${state}.`);
    return;
  }
  warn(
    `\`${DB_CONTAINER}\` is shared by every oddlink checkout and worktree on this machine: until it is\n` +
      "  started again, their dev servers and tests cannot reach Postgres.\n" +
      "  Use `pnpm stop --keep-db` to stop only the dev server.",
  );
  const { code, stderr } = capture("docker", ["stop", DB_CONTAINER]);
  if (code !== 0) die(`Could not stop \`${DB_CONTAINER}\`.`, stderr.trim());
  ok(`${DB_CONTAINER} stopped. Its data is kept; \`pnpm bootstrap\` starts it again.`);
}

step("Stopping the dev server");
const devStopped = await stopDevServer();

if (keepDb) {
  info(`\nLeaving \`${DB_CONTAINER}\` running (--keep-db).`);
} else {
  step("Stopping Postgres");
  stopDatabase();
}

if (!devStopped) process.exit(1);
