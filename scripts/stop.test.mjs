// Tests for scripts/stop.mjs: `pnpm test:scripts`.
// They never touch the real dev-server record or the real `oddlink-db` container: the record lives in
// a temporary directory and the container tests use a throwaway container (skipped without Docker).
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { processInfo } from "./lib.mjs";

const STOP = join(import.meta.dirname, "stop.mjs");
const unix = process.platform !== "win32";
const tmp = mkdtempSync(join(tmpdir(), "oddlink-stop-test-"));
const recordFile = join(tmp, "dev-server.json");
const container = `oddlink-stop-test-${process.pid}`;

after(() => rmSync(tmp, { recursive: true, force: true }));

// Asynchronous so this process keeps reaping its own children while stop.mjs waits for them to exit.
async function runStop(args) {
  const child = spawn(process.execPath, [STOP, ...args], {
    env: { ...process.env, ODDLINK_DEV_PID_FILE: recordFile, ODDLINK_DB_CONTAINER: container },
  });
  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));
  const [code] = await once(child, "close");
  return { code, output };
}

function writeRecord(record) {
  writeFileSync(recordFile, JSON.stringify(record));
}

/** Spawns a long-running process and waits until `ps` can see it. */
async function spawnAlive(args) {
  const child = spawn(process.execPath, args, { stdio: "ignore" });
  await once(child, "spawn");
  return child;
}

const isAlive = (child) => child.exitCode === null && child.signalCode === null;

/** A stand-in for `pnpm bootstrap`: its command line ends in scripts/bootstrap.mjs and SIGTERM ends it. */
function fakeBootstrap() {
  const dir = join(tmp, "scripts");
  mkdirSync(dir, { recursive: true });
  const file = join(dir, "bootstrap.mjs");
  writeFileSync(file, 'setInterval(() => {}, 1000);\nprocess.on("SIGTERM", () => process.exit(143));\n');
  return spawnAlive([file]);
}

describe("dev server", { skip: !unix && "needs ps" }, () => {
  test("no record: reports that nothing is running", async () => {
    rmSync(recordFile, { force: true });
    const { code, output } = await runStop(["--keep-db"]);
    assert.equal(code, 0);
    assert.match(output, /No dev server started by `pnpm bootstrap` is running/);
  });

  test("stale record (process gone): reports nothing running and removes the record", async () => {
    const child = await spawnAlive(["-e", ""]);
    await once(child, "exit");
    writeRecord({ pid: child.pid, started: "Mon Jan  1 00:00:00 2024" });
    const { code, output } = await runStop(["--keep-db"]);
    assert.equal(code, 0);
    assert.match(output, /No dev server started by `pnpm bootstrap` is running/);
    assert.equal(existsSync(recordFile), false);
  });

  test("record naming a live process that is not bootstrap: leaves it alone", async () => {
    const child = await spawnAlive(["-e", "setInterval(() => {}, 1000)"]);
    try {
      writeRecord({ pid: child.pid, started: processInfo(child.pid).started });
      const { code, output } = await runStop(["--keep-db"]);
      assert.equal(code, 0);
      assert.match(output, /No dev server started by `pnpm bootstrap` is running/);
      assert.ok(isAlive(child), "an unrelated process must not be signalled");
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("record whose start time does not match (PID reused): leaves the process alone", async () => {
    const child = await fakeBootstrap();
    try {
      writeRecord({ pid: child.pid, started: "Mon Jan  1 00:00:00 2024" });
      const { code } = await runStop(["--keep-db"]);
      assert.equal(code, 0);
      assert.ok(isAlive(child), "a process with a different start time must not be signalled");
    } finally {
      child.kill("SIGKILL");
    }
  });

  test("running bootstrap: sends SIGTERM, waits for it to exit and removes the record", async () => {
    const child = await fakeBootstrap();
    const exited = once(child, "exit");
    writeRecord({ pid: child.pid, started: processInfo(child.pid).started });
    const { code, output } = await runStop(["--keep-db"]);
    assert.equal(code, 0, output);
    assert.match(output, /Dev server stopped/);
    assert.equal((await exited)[0], 143);
    assert.equal(existsSync(recordFile), false);
  });
});

const docker = (args) => spawnSync("docker", args, { encoding: "utf8" });
const hasDocker = docker(["info", "--format", "{{.ServerVersion}}"]).status === 0;
const state = () => docker(["container", "inspect", "--format", "{{.State.Status}}", container]).stdout.trim();

describe("database container", { skip: !hasDocker && "Docker is not running" }, () => {
  before(() => rmSync(recordFile, { force: true }));
  after(() => docker(["rm", "-f", container]));

  test("missing container: says so and exits 0", async () => {
    const { code, output } = await runStop([]);
    assert.equal(code, 0);
    assert.match(output, new RegExp(`There is no \`${container}\` container`));
  });

  test("running container: warns that it is shared, then stops it without removing it", async () => {
    const created = docker(["run", "-d", "--init", "--name", container, "alpine", "sleep", "300"]);
    assert.equal(created.status, 0, created.stderr);
    const { code, output } = await runStop([]);
    assert.equal(code, 0, output);
    assert.match(output, /shared by every oddlink checkout and worktree/);
    assert.match(output, /stopped\. Its data is kept/);
    assert.equal(state(), "exited");
  });

  test("stopped container: says it is already stopped", async () => {
    const { code, output } = await runStop([]);
    assert.equal(code, 0);
    assert.match(output, new RegExp(`\`${container}\` is already exited`));
    assert.doesNotMatch(output, /shared by every/);
  });

  test("--keep-db: leaves a running container alone", async () => {
    assert.equal(docker(["start", container]).status, 0);
    const { code, output } = await runStop(["--keep-db"]);
    assert.equal(code, 0);
    assert.match(output, /Leaving .* running \(--keep-db\)/);
    assert.equal(state(), "running");
  });
});

test("unknown argument: exits non-zero with usage", async () => {
  const { code, output } = await runStop(["--db-only"]);
  assert.equal(code, 1);
  assert.match(output, /Usage: pnpm stop \[--keep-db\]/);
});
