// Smoke test for the production build: migrates a fresh database, starts `next start` from
// apps/web/.next, and checks the main routes over HTTP. Then checks that the server refuses to
// start when a required variable is missing.
//
// Usage: SMOKE_DATABASE_URL=postgres://user:pass@host:5432/oddlink_smoke node scripts/ci-smoke.mjs
// Run `pnpm build` first. The database is created if it does not exist and must not hold any tables
// yet. Only the server processes this script starts are stopped.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import net from "node:net";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { WEB_DIR, ok, pnpm, step } from "./lib.mjs";

const require = createRequire(join(WEB_DIR, "package.json"));
const { Client } = require("pg");
const NEXT_BIN = require.resolve("next/dist/bin/next");

const STARTUP_TIMEOUT_MS = 60_000;
const ACTIVE_CODE = "smoke-active-link";
const DISABLED_CODE = "smoke-disabled-link";
const UNKNOWN_CODE = "smoke-unknown-link";
const TARGET_URL = "https://example.com/smoke?q=1";

const databaseUrl = process.env.SMOKE_DATABASE_URL;
if (!databaseUrl) fail("SMOKE_DATABASE_URL is not set.");
if (!existsSync(join(WEB_DIR, ".next", "BUILD_ID"))) fail("apps/web/.next has no build. Run `pnpm build` first.");

const port = await freePort();
const baseUrl = `http://localhost:${port}`;
// Placeholder values that pass validation. The Safe Browsing key is never used: links are seeded
// through SQL, so no request reaches the issue endpoint that would call Google.
const serverEnv = {
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  // The server runs on this machine, so production mode must be told to accept localhost URLs.
  ALLOW_LOCAL_PRODUCTION: "1",
  BASE_URL: baseUrl,
  DATABASE_URL: databaseUrl,
  APP_TIME_ZONE: "Asia/Tokyo",
  SAFE_BROWSING_API_KEY: "smoke-placeholder-key",
  RATE_LIMIT_SECRET: "smoke-placeholder-rate-limit-secret-0123456789",
  ISSUE_RATE_LIMIT_MAX: "100",
  ISSUE_RATE_LIMIT_WINDOW_SECONDS: "60",
};

let server;
process.on("exit", () => stopServer(server));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => process.exit(1));
}

await prepareDatabase();
await seedLinks();

step(`next start on port ${port}`);
server = startServer(serverEnv);
await waitUntilReady(server);
ok("server is ready");

step("routes");
await expectResponse("GET /", "/", { status: 200 });
await expectResponse("unknown code", `/${UNKNOWN_CODE}`, { status: 404 });
await expectResponse("issued code redirects", `/${ACTIVE_CODE}`, { status: 302, location: TARGET_URL });
await expectResponse("preview page", `/${ACTIVE_CODE}+`, { status: 200 });
await expectResponse("analytics page", `/analytics/${ACTIVE_CODE}`, { status: 200 });
await expectResponse("analytics for an unknown code", `/analytics/${UNKNOWN_CODE}`, { status: 404 });
await expectResponse("disabled code is gone", `/${DISABLED_CODE}`, { status: 410 });
await expectResponse("preview for a disabled code is gone", `/${DISABLED_CODE}+`, { status: 410 });
// A disabled link keeps its analytics page, which shows that it is disabled.
await expectResponse("analytics for a disabled code", `/analytics/${DISABLED_CODE}`, { status: 200 });
await stopServer(server);
server = undefined;

step("next start without RATE_LIMIT_SECRET");
// An empty value, not a deleted one: Next.js fills unset variables from apps/web/.env files, but
// leaves defined ones alone, and the app treats "" as unset.
server = startServer({ ...serverEnv, RATE_LIMIT_SECRET: "" });
const exitCode = await waitForExit(server, STARTUP_TIMEOUT_MS);
if (exitCode === null) fail("the server kept running without RATE_LIMIT_SECRET", server.output);
if (exitCode === 0 || !server.output.join("").includes("RATE_LIMIT_SECRET")) {
  fail(`expected a non-zero exit naming RATE_LIMIT_SECRET, got exit code ${exitCode}`, server.output);
}
ok(`startup failed with exit code ${exitCode} and named the missing variable`);

console.log("\nSmoke test passed.");

async function prepareDatabase() {
  step("database");
  const url = new URL(databaseUrl);
  const dbName = decodeURIComponent(url.pathname.slice(1));
  const admin = new Client({ connectionString: new URL("/postgres", url).toString() });
  await admin.connect();
  try {
    const { rowCount } = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [dbName]);
    if (!rowCount) {
      await admin.query(`CREATE DATABASE "${dbName.replaceAll('"', '""')}"`);
      ok(`created database ${dbName}`);
    }
  } finally {
    await admin.end();
  }

  await withClient(async (client) => {
    const { rows } = await client.query(
      "SELECT count(*)::int AS n FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')",
    );
    if (rows[0].n > 0) fail(`database ${dbName} is not empty; the smoke test needs a fresh one.`);
  });

  const { code } = await pnpm(["--filter", "web", "db:migrate"], { env: { DATABASE_URL: databaseUrl } });
  if (code !== 0) fail("db:migrate failed");
  ok("migrations applied");
}

async function seedLinks() {
  await withClient((client) =>
    client.query(
      `INSERT INTO url_mappings (short_code, original_url, disabled_at, disabled_by)
       VALUES ($1, $3, NULL, NULL), ($2, $3, now(), 'operator')`,
      [ACTIVE_CODE, DISABLED_CODE, TARGET_URL],
    ),
  );
  ok("seeded an active and a disabled link");
}

async function withClient(fn) {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

function startServer(env) {
  // Its own process group, so stopping it reaches any workers it forks and nothing else.
  const child = spawn(process.execPath, [NEXT_BIN, "start", "--port", String(port)], {
    cwd: WEB_DIR,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
  });
  child.output = [];
  child.exited = new Promise((resolve) => child.on("exit", (code, signal) => resolve(code ?? signal)));
  child.stdout.on("data", (chunk) => child.output.push(chunk.toString()));
  child.stderr.on("data", (chunk) => child.output.push(chunk.toString()));
  return child;
}

async function waitUntilReady(child) {
  const deadline = Date.now() + STARTUP_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) fail("the server exited during startup", child.output);
    try {
      await fetch(baseUrl, { redirect: "manual", signal: AbortSignal.timeout(5_000) });
      return;
    } catch {
      await sleep(250);
    }
  }
  fail(`the server did not answer within ${STARTUP_TIMEOUT_MS / 1000}s`, child.output);
}

async function waitForExit(child, timeoutMs) {
  // An unref'd timer, so a pending timeout does not keep the script alive after the child exits.
  return Promise.race([child.exited, sleep(timeoutMs, null, { ref: false })]);
}

async function stopServer(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (process.platform === "win32") child.kill();
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    return;
  }
  // Called synchronously from the "exit" handler too, where there is nothing left to wait for.
  return waitForExit(child, 10_000);
}

async function expectResponse(name, path, expected) {
  const res = await fetch(new URL(path, baseUrl), { redirect: "manual", signal: AbortSignal.timeout(15_000) });
  await res.arrayBuffer();
  const problems = [];
  if (res.status !== expected.status) problems.push(`status ${res.status}, expected ${expected.status}`);
  if (expected.location !== undefined && res.headers.get("location") !== expected.location) {
    problems.push(`Location ${JSON.stringify(res.headers.get("location"))}, expected ${JSON.stringify(expected.location)}`);
  }
  if (problems.length) fail(`${name} (${path}): ${problems.join("; ")}`, server?.output);
  ok(`${name}: ${path} → ${res.status}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port: found } = probe.address();
      probe.close(() => resolve(found));
    });
  });
}

function fail(message, output) {
  if (output?.length) console.error(`\n--- server output ---\n${output.join("")}--- end of server output ---`);
  console.error(`\n✖ ${message}`);
  process.exit(1);
}
