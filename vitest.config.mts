import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/global-setup.ts"],
    // Integration tests share one database and truncate it between tests.
    fileParallelism: false,
    env: {
      DATABASE_URL: process.env.TEST_DATABASE_URL!,
      BASE_URL: "http://localhost:3000",
      APP_TIME_ZONE: "Asia/Tokyo",
    },
  },
});
