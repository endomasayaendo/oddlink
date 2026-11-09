import { getEnv, resolveMode } from "@/lib/env";

/**
 * Validates the environment when the server starts (called from instrumentation.ts).
 *
 * `next start` only logs a throwing register() and keeps serving 500s, which restart policies and
 * health checks may not notice, so in production exit so the deploy fails visibly. Elsewhere just
 * rethrow and let Next decide (as of 16.4, `next dev` prints the error and exits by itself).
 */
export function checkEnvAtStartup() {
  try {
    getEnv();
  } catch (error) {
    if (resolveMode(process.env) !== "runtime") throw error;
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
