import { existsSync } from "node:fs";
import { createInterface } from "node:readline/promises";

// Operator entry point: `tsx scripts/link-control.ts <disable|enable|delete> [--yes] <code>`, run
// from apps/web (pnpm --filter web link:*). Always acts as the operator.
//
// Like drizzle.config.ts, values already set in the shell win over apps/web/.env, so
// `DATABASE_URL=... pnpm --filter web link:disable <code>` targets another database. The database
// modules are imported only after the environment is loaded, because they read it on import.

async function run(): Promise<number> {
  if (existsSync(".env")) process.loadEnvFile(".env");
  if (!process.env.DATABASE_URL) {
    console.error("error: DATABASE_URL is not set (in the shell or apps/web/.env)");
    return 2;
  }

  const [{ main }, { db }] = await Promise.all([import("./link-control/main"), import("@/lib/db")]);
  try {
    return await main(process.argv.slice(2), {
      stdout: (line) => console.log(line),
      stderr: (line) => console.error(line),
      interactive: Boolean(process.stdin.isTTY),
      prompt: async (question) => {
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        // Ctrl+C or end of input rejects the pending question instead of leaving it hanging.
        const closed = new Promise<never>((_, reject) => rl.once("close", () => reject(new Error("input closed"))));
        // Closing after an answer also rejects it; nobody awaits it then.
        closed.catch(() => {});
        try {
          return await Promise.race([rl.question(question), closed]);
        } finally {
          rl.close();
        }
      },
    });
  } finally {
    await db.$client.end();
  }
}

run().then(
  (code) => {
    process.exitCode = code;
  },
  () => {
    // Never print the error itself: it may carry connection details.
    console.error("error: unexpected failure");
    process.exitCode = 1;
  },
);
