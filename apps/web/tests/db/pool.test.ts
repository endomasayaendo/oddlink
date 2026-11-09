import type { Pool } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createPool } from "@/lib/db";

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
