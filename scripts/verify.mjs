// `pnpm verify`: the same checks CI runs (.github/workflows/ci.yml), in the same order.
// It needs Postgres for the tests but never starts anything itself; use `pnpm bootstrap` for that.
import { canConnect, capture, die, info, ok, pnpm, readWebEnv, step } from "./lib.mjs";

if (process.argv.length > 2) {
  die(`Unknown argument: ${process.argv.slice(2).join(" ")}`, "Usage: pnpm verify");
}

const NO_DB_HINT =
  "Run `pnpm bootstrap` (first-time setup) or `pnpm db:up` (just start the database), then try again.";

// Fail fast: the tests are the last stage, and lint/typecheck/build take a while.
const testDatabaseUrl = process.env.TEST_DATABASE_URL || readWebEnv().TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  die("TEST_DATABASE_URL is not set (and apps/web/.env does not define it), so the tests cannot run.", NO_DB_HINT);
}
let host = "localhost";
let port = 5432;
try {
  const url = new URL(testDatabaseUrl);
  // An IPv6 host comes back bracketed ("[::1]"), which net.connect() does not accept.
  host = url.hostname.replace(/^\[(.*)\]$/, "$1") || host;
  port = Number(url.port) || port;
} catch {
  // Not a parseable URL: fall through to the default and let the tests report the real problem.
}
if (!(await canConnect(host, port))) {
  die(`Postgres is not reachable at ${host}:${port}.`, NO_DB_HINT);
}

// `drizzle-kit generate` writes a new migration when schema.ts has changes no migration covers.
// Comparing git status before and after (rather than requiring a clean tree) still lets a migration
// that was generated but not yet committed pass.
const drizzleStatus = () => capture("git", ["status", "--porcelain", "apps/web/drizzle"]).stdout;

// CI builds with no DATABASE_URL on purpose, so a build-time DB read fails loudly. Locally the
// variables may come from the shell or apps/web/.env; Next.js does not override a variable that is
// already defined (even as ""), and apps/web/lib/env.ts treats "" as unset. `--force` stops turbo
// from replaying a cached build, which would skip the check.
const stages = [
  { name: "lint", args: ["lint"] },
  { name: "typecheck", args: ["typecheck"] },
  {
    name: "schema",
    args: ["--filter", "web", "exec", "drizzle-kit", "generate"],
    before: drizzleStatus,
    after: (before) =>
      drizzleStatus() === before ? null : "schema.ts has changes with no migration; review and commit the files it generated.",
  },
  {
    name: "build",
    args: ["build", "--force"],
    env: { DATABASE_URL: "", BASE_URL: "", APP_TIME_ZONE: "" },
  },
  { name: "test", args: ["test"] },
];

const timings = [];
for (const stage of stages) {
  step(`${stage.name}: pnpm ${stage.args.join(" ")}`);
  const started = Date.now();
  const snapshot = stage.before?.();
  const { code, signal } = await pnpm(stage.args, { env: stage.env });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (code !== 0) {
    die(`verify failed at stage "${stage.name}" (${signal ?? `exit code ${code}`}, after ${seconds}s).`);
  }
  const problem = stage.after?.(snapshot);
  if (problem) die(`verify failed at stage "${stage.name}": ${problem}`);
  ok(`${stage.name} passed (${seconds}s)`);
  timings.push(`${stage.name} ${seconds}s`);
}

info(`\n✔ verify passed: ${timings.join(" · ")}`);
