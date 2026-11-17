import { attachDatabasePool } from "@vercel/functions";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { getEnv, type Env } from "@/lib/env";
import * as schema from "./schema";

// Redirects sit on the hot path, so a stuck DB should fail fast instead of hanging the request.
const CONNECTION_TIMEOUT_MS = 5_000;
const STATEMENT_TIMEOUT_MS = 5_000;
// Each serverless instance holds its own pool, so the total connection count is instances × `max`.
// Small, but above 1 so concurrent requests on one instance do not queue behind each other.
const POOL_MAX = 5;
// Short, so idle connections close soon after a burst instead of holding pooler slots.
const IDLE_TIMEOUT_MS = 5_000;

/**
 * TLS settings for node-postgres. With a CA: TLS is required, the server certificate must chain to
 * that CA and its name must match the host (Node's default `checkServerIdentity`). Without one:
 * plain TCP. `false` is explicit so PGSSLMODE in the environment cannot switch TLS on or off behind
 * our back; DATABASE_URL cannot either, because `lib/env.ts` rejects TLS query parameters.
 */
export function sslOptions(env: Pick<Env, "DATABASE_CA_CERT">): PoolConfig["ssl"] {
  if (!env.DATABASE_CA_CERT) return false;
  return { ca: env.DATABASE_CA_CERT, rejectUnauthorized: true };
}

export function createPool(env: Env = getEnv()): Pool {
  const pool = new Pool({
    connectionString: env.DATABASE_URL,
    ssl: sslOptions(env),
    max: POOL_MAX,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    // Sent as a startup parameter, so Postgres cancels the query itself (`query_timeout` only stops
    // the client waiting). Poolers in transaction mode may not apply startup parameters; a
    // role-level `ALTER ROLE ... SET statement_timeout` covers that case.
    statement_timeout: STATEMENT_TIMEOUT_MS,
  });

  // An idle client that dies (DB restart, network drop) emits `error` on the pool; without a
  // listener Node would crash the process. The pool already discards the broken client, so only log.
  // Log `code`/`message` only: pg attaches `err.client`, whose connection parameters include the password.
  pool.on("error", (err: Error & { code?: string }) => {
    console.error("[db] idle client error", { code: err.code, message: err.message });
  });

  // On Vercel, keeps the function instance alive until released clients pass the idle timeout, so
  // they are closed instead of left open while the instance is suspended. Elsewhere it returns
  // without waiting (it requires VERCEL_URL and VERCEL_REGION).
  attachDatabasePool(pool);

  return pool;
}

// Reuse the pool across dev hot reloads so connections don't pile up (and the listeners are only
// attached on creation). A reused dev pool keeps its old options until `next dev` restarts.
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool = globalForDb.pool ?? createPool();
if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
