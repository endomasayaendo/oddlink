import { getEnv, resolveMode } from "@/lib/env";

/**
 * Validates the environment when the server starts (called from instrumentation.ts).
 *
 * Next only logs a throwing register() and keeps serving 500s, which restart policies and health
 * checks may not notice. In production, exit so the deploy fails visibly. In dev, rethrow so the
 * error shows up without killing the dev server.
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
