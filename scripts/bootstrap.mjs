// One-command local setup: `pnpm bootstrap` (add `--no-dev` to skip starting the dev server).
// Safe to run repeatedly: it never overwrites apps/web/.env and reuses an existing DB container.
import { constants, copyFileSync, existsSync } from "node:fs";
import { constants as osConstants } from "node:os";
import { ENV_EXAMPLE, ENV_FILE, capture, die, info, ok, pnpm, run, sleep, step, warn } from "./lib.mjs";

// The compose file hard-codes this name. ODDLINK_DB_CONTAINER exists only so the container-state
// branches below can be exercised against a throwaway container; it does not rename the one that
// `pnpm db:up` creates.
const DB_CONTAINER = process.env.ODDLINK_DB_CONTAINER || "oddlink-db";
const HEALTH_POLL_MS = 2000;
const HEALTH_TIMEOUT_MS = 60_000;

const args = process.argv.slice(2);
const noDev = args.includes("--no-dev");
const unknown = args.filter((arg) => arg !== "--no-dev");
if (unknown.length > 0) {
  die(`Unknown argument: ${unknown.join(" ")}`, "Usage: pnpm bootstrap [--no-dev]");
}

const PORT_HINT =
  "If the error mentions port 5432, another Postgres (or another oddlink checkout's database) is\n" +
  "already listening there. Stop it, or use it as-is: this project expects Postgres on localhost:5432.";

function checkDocker() {
  const result = capture("docker", ["info", "--format", "{{.ServerVersion}}"]);
  if (result.error?.code === "ENOENT") {
    die(
      "Docker is not installed (the `docker` command was not found).",
      "Install Docker Desktop (https://docs.docker.com/get-docker/), start it, then run `pnpm bootstrap` again.",
    );
  }
  if (result.code !== 0) {
    die(
      "Docker is installed but not running (or this user cannot reach the daemon).",
      `${result.stderr.trim()}\n\n` +
        "Start Docker Desktop (or the Docker daemon), wait until it is ready, then run `pnpm bootstrap` again.",
    );
  }
}

/** The container's state ("running", "exited", "created", ...), or null if it does not exist. */
function containerState() {
  const result = capture("docker", ["container", "inspect", "--format", "{{.State.Status}}", DB_CONTAINER]);
  if (result.code === 0) return result.stdout.trim();
  if (/no such/i.test(result.stderr)) return null;
  die(`Could not inspect the \`${DB_CONTAINER}\` container.`, result.stderr.trim());
}

/**
 * The plain status unless the container is running; then "healthy" / "unhealthy" / "starting", or
 * "running" if the image has no healthcheck. The status is checked first because a stopped
 * container can keep its last health value.
 */
function containerHealth() {
  const format =
    "{{if and (eq .State.Status \"running\") .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}";
  const result = capture("docker", ["container", "inspect", "--format", format, DB_CONTAINER]);
  return result.code === 0 ? result.stdout.trim() : "missing";
}

async function waitUntilHealthy() {
  const deadline = Date.now() + HEALTH_TIMEOUT_MS;
  let last = "";
  while (Date.now() < deadline) {
    const health = containerHealth();
    // Without a healthcheck, "running" is the best signal available.
    if (health === "healthy" || health === "running") return;
    if (health === "exited" || health === "dead" || health === "missing") {
      die(
        `The \`${DB_CONTAINER}\` container stopped (${health}) while waiting for it.`,
        `Look at its logs: docker logs ${DB_CONTAINER}\n\n${PORT_HINT}`,
      );
    }
    if (health !== last) info(`  waiting for ${DB_CONTAINER}: ${health}…`);
    last = health;
    await sleep(HEALTH_POLL_MS);
  }
  die(
    `\`${DB_CONTAINER}\` did not become healthy within ${HEALTH_TIMEOUT_MS / 1000}s (last status: ${last}).`,
    `Look at its logs: docker logs ${DB_CONTAINER}`,
  );
}

async function ensureDatabase() {
  const state = containerState();
  if (state === null) {
    info(`No \`${DB_CONTAINER}\` container yet; creating it with \`pnpm db:up\`.`);
    const { code } = await pnpm(["db:up"]);
    if (code !== 0) die("`pnpm db:up` failed.", PORT_HINT);
  } else if (state === "running" || state === "restarting") {
    info(`\`${DB_CONTAINER}\` is already ${state}.`);
  } else if (state === "paused") {
    info(`\`${DB_CONTAINER}\` is paused; unpausing it.`);
    const { code, stderr } = capture("docker", ["unpause", DB_CONTAINER]);
    if (code !== 0) die(`Could not unpause \`${DB_CONTAINER}\`.`, stderr.trim());
  } else {
    // It may belong to another compose project (e.g. another checkout or worktree), so
    // `docker compose up` would fail with a container-name conflict. Starting it by name works.
    info(`\`${DB_CONTAINER}\` exists but is ${state}; starting it.`);
    const { code, stderr } = capture("docker", ["start", DB_CONTAINER]);
    if (code !== 0) die(`Could not start \`${DB_CONTAINER}\`.`, `${stderr.trim()}\n\n${PORT_HINT}`);
  }
  await waitUntilHealthy();
  ok(`${DB_CONTAINER} is healthy.`);
}

async function startDev() {
  step("Starting the dev server (Ctrl+C to stop)");
  let child;
  // Ctrl+C reaches the whole foreground process group, so the child already gets SIGINT from the
  // terminal; forwarding it again could make turbo force-quit. SIGTERM/SIGHUP are not delivered
  // that way, so forward those.
  process.on("SIGINT", () => {});
  for (const signal of ["SIGTERM", "SIGHUP"]) {
    process.on(signal, () => child?.kill(signal));
  }
  const { code, signal } = await run("pnpm", ["dev"], { onChild: (c) => (child = c) });
  process.exit(code ?? 128 + (osConstants.signals[signal] ?? 0));
}

// 0. Docker first: fail before spending minutes on `pnpm install`.
step("Checking Docker");
checkDocker();
ok("Docker is running.");

// 1. Dependencies.
step("Installing dependencies (pnpm install)");
if ((await pnpm(["install"])).code !== 0) die("`pnpm install` failed.");

// 2. Environment file. COPYFILE_EXCL makes the copy fail rather than overwrite an existing file.
step("Checking apps/web/.env");
if (!existsSync(ENV_EXAMPLE)) die("apps/web/.env.example is missing; cannot create apps/web/.env.");
try {
  copyFileSync(ENV_EXAMPLE, ENV_FILE, constants.COPYFILE_EXCL);
  ok("Created apps/web/.env from .env.example.");
} catch (error) {
  if (error.code !== "EEXIST") die(`Could not create apps/web/.env: ${error.message}`);
  ok("apps/web/.env already exists; leaving it untouched.");
}

// 3. Database.
step("Starting Postgres");
await ensureDatabase();

// 4. Migrations.
step("Applying migrations (pnpm db:migrate)");
if ((await pnpm(["db:migrate"])).code !== 0) {
  die(
    "`pnpm db:migrate` failed.",
    "If it reports an authentication or missing-database error, the existing Postgres volume was\n" +
      "probably created with different DB_NAME / DB_USERNAME / DB_PASSWORD than apps/web/.env now says\n" +
      "(Postgres reads those only the first time the volume is initialised). Either change .env back,\n" +
      "or delete the volume (this erases the local data) with\n" +
      "`docker compose -f apps/web/docker-compose.yml down -v` and run this again.",
  );
}

// 5. Dev server.
if (noDev) {
  warn("Skipping the dev server (--no-dev).");
  info("\nNext steps:\n  pnpm dev      start the app at http://localhost:3000\n  pnpm verify   run the CI checks locally");
} else {
  await startDev();
}
