import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPool, sharedPool } from "@/lib/db";

const pools: Pool[] = [];

function newPool() {
  const pool = createPool();
  pools.push(pool);
  return pool;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(pools.splice(0).map((pool) => pool.end()));
});

describe("createPool", () => {
  it("sets connection and statement timeouts", () => {
    const pool = newPool();
    expect(pool.options.connectionTimeoutMillis).toBe(5000);
    expect(pool.options.statement_timeout).toBe(5000);
  });

  it("keeps the pool small and closes idle connections quickly", () => {
    const pool = newPool();
    expect(pool.options.max).toBe(5);
    expect(pool.options.idleTimeoutMillis).toBe(5000);
  });

  it("connects without TLS when DATABASE_CA_CERT is unset", () => {
    expect(newPool().options.ssl).toBe(false);
  });

  it("works off Vercel with attachDatabasePool installed", async () => {
    const pool = newPool();
    expect(pool.listenerCount("release")).toBeGreaterThan(0);
    const client = await pool.connect();
    client.release();
    const { rows } = await pool.query("SELECT 1 AS one");
    expect(rows[0].one).toBe(1);
  });

  it("logs pool errors without leaking secrets", () => {
    const pool = newPool();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = Object.assign(new Error("connection terminated"), {
      code: "ECONNRESET",
      client: { connectionParameters: { password: "SECRET" } },
    });

    expect(() => pool.emit("error", err, err.client)).not.toThrow();

    expect(spy).toHaveBeenCalled();
    expect(JSON.stringify(spy.mock.calls)).not.toContain("SECRET");
    expect(JSON.stringify(spy.mock.calls)).toContain("ECONNRESET");
  });

  it("survives an error on an idle client and keeps serving queries", async () => {
    const pool = newPool();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    const client = await pool.connect();
    client.release();
    client.emit("error", new Error("x"));

    expect(spy).toHaveBeenCalled();
    const { rows } = await pool.query("SELECT 1 AS one");
    expect(rows[0].one).toBe(1);
  });
});

describe("sharedPool", () => {
  it("reuses one pool when the db module is evaluated again in the same process", async () => {
    vi.resetModules();
    const first = await import("@/lib/db");
    vi.resetModules();
    const second = await import("@/lib/db");

    expect(second.db.$client).toBe(first.db.$client);
    expect(second.sharedPool()).toBe(first.db.$client);
    expect(first.db.$client.listenerCount("error")).toBe(1);
  });

  it("returns the existing pool without creating another", () => {
    const create = vi.fn(createPool);
    expect(sharedPool(create)).toBe(sharedPool(create));
    expect(create).not.toHaveBeenCalled();
  });
});
