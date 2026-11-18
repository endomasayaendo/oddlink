import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

// Puts the `test_clock` schema ahead of `pg_catalog` on every test connection, so an unqualified
// `now()` resolves to `test_clock.now()` (see tests/utils/test-clock.ts).
function withTestClock(databaseUrl: string | undefined) {
  if (!databaseUrl) return databaseUrl;
  const url = new URL(databaseUrl);
  url.searchParams.set("options", "-c search_path=test_clock,pg_catalog,public");
  return url.toString();
}

export default defineConfig({
  resolve: {
    alias: [{ find: /^@\//, replacement: fileURLToPath(new URL("./", import.meta.url)) }],
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    setupFiles: ["./tests/setup/clock-start.ts"],
    // Integration tests share one database and truncate it between tests.
    fileParallelism: false,
    env: {
      DATABASE_URL: withTestClock(process.env.TEST_DATABASE_URL)!,
      BASE_URL: "http://localhost:3000",
      APP_TIME_ZONE: "Asia/Tokyo",
      // Never call Google from tests, even if a developer's .env has a key; tests mock fetch.
      SAFE_BROWSING_API_KEY: "",
      // Fixed so tests don't depend on a developer's .env. The limit is high enough that only the
      // rate-limit tests (which pass their own) ever reach it.
      RATE_LIMIT_SECRET: "test-only-rate-limit-secret-0123456789",
      ISSUE_RATE_LIMIT_MAX: "1000",
      // Far longer than a test run, so a test never sees the count reset at a window boundary.
      ISSUE_RATE_LIMIT_WINDOW_SECONDS: "2000000000",
    },
  },
});
