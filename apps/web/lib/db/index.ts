import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

// Redirects sit on the hot path, so a stuck DB should fail fast instead of hanging the request.
const CONNECTION_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 5_000;

export function createPool(): Pool {
  // `max` and `idleTimeoutMillis` are left at their defaults on purpose. Revisit `max` once the
  // deploy target is chosen: serverless needs a small `max` or an external pooler, and some
  // poolers reject `statement_timeout` as a startup parameter.
  const pool = new Pool({
    connectionString: getEnv().DATABASE_URL,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    // Server-side, so Postgres cancels the query itself (`query_timeout` only stops the client waiting).
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });

  // An idle client that dies (DB restart, network drop) emits `error` on the pool; without a
  // listener Node would crash the process. The pool already discards the broken client, so only log.
  // Log `code`/`message` only: pg attaches `err.client`, whose connection parameters include the password.
  pool.on("error", (err: Error & { code?: string }) => {
    console.error("[db] idle client error", { code: err.code, message: err.message });
  });

  return pool;
}

// Reuse the pool across dev hot reloads so connections don't pile up (and the error listener is
// only attached on creation). A reused dev pool keeps its old options until `next dev` restarts.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = globalForDb.pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
