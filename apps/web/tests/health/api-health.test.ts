import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, HEAD } from "@/app/api/health/route";
import { db } from "@/lib/db";
import { pingDatabase } from "@/lib/db/ping";

// `connection()` needs Next's request scope, which a direct handler call doesn't have.
const connection = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("next/server", async (importOriginal) => ({ ...(await importOriginal<object>()), connection }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function expectHealthHeaders(res: Response) {
  expect(res.headers.get("cache-control")).toBe("no-store");
  expect(res.headers.get("x-robots-tag")).toBe("noindex");
}

// A failure whose message carries the kind of detail that must never reach the response.
function failingQuery() {
  const cause = Object.assign(new Error("connect ECONNREFUSED db.internal.example:5432 (PostgreSQL 17.2)"), {
    code: "ECONNREFUSED",
    client: { connectionParameters: { password: "SECRET" } },
  });
  return vi.spyOn(db, "execute").mockRejectedValue(new Error("Failed query: SELECT 1", { cause }));
}

describe("GET /api/health", () => {
  it("returns 200 ok when the database answers", async () => {
    const res = await GET();
    expect(connection).toHaveBeenCalled();
    expect(res.status).toBe(200);
    expectHealthHeaders(res);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("returns 503 without error details when the query fails, and logs the error", async () => {
    failingQuery();
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await GET();

    expect(res.status).toBe(503);
    expectHealthHeaders(res);
    const body = await res.text();
    expect(JSON.parse(body)).toEqual({ status: "unavailable" });
    for (const leak of ["ECONNREFUSED", "db.internal.example", "5432", "PostgreSQL", "SECRET"]) {
      expect(body).not.toContain(leak);
    }

    expect(log).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(log.mock.calls);
    expect(logged).toContain("ECONNREFUSED");
    expect(logged).not.toContain("SECRET");
  });
});

describe("HEAD /api/health", () => {
  it("returns 200 with no body when the database answers", async () => {
    const res = await HEAD();
    expect(res.status).toBe(200);
    expectHealthHeaders(res);
    expect(await res.text()).toBe("");
  });

  it("returns 503 with no body when the query fails", async () => {
    failingQuery();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await HEAD();
    expect(res.status).toBe(503);
    expectHealthHeaders(res);
    expect(await res.text()).toBe("");
  });
});

describe("pingDatabase", () => {
  it("resolves against the real database", async () => {
    await expect(pingDatabase()).resolves.toBeUndefined();
  });

  it("runs the query once, although drizzle's query object re-runs on every then", async () => {
    let runs = 0;
    const lazyQuery = {
      then(onFulfilled?: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) {
        runs += 1;
        return Promise.resolve([]).then(onFulfilled, onRejected);
      },
    };
    vi.spyOn(db, "execute").mockReturnValue(lazyQuery as never);

    await pingDatabase();
    expect(runs).toBe(1);
  });

  it("rejects once the timeout passes, even if the query never settles", async () => {
    vi.useFakeTimers();
    vi.spyOn(db, "execute").mockReturnValue(new Promise(() => {}) as never);

    const ping = pingDatabase(2_500);
    const assertion = expect(ping).rejects.toThrow("timed out after 2500 ms");
    await vi.advanceTimersByTimeAsync(2_500);
    await assertion;
  });

  it("does not leave an unhandled rejection when the query fails after the timeout", async () => {
    vi.useFakeTimers();
    let rejectQuery!: (err: Error) => void;
    vi.spyOn(db, "execute").mockReturnValue(
      new Promise((_, reject) => {
        rejectQuery = reject;
      }) as never,
    );
    const unhandled = vi.fn();
    process.on("unhandledRejection", unhandled);
    try {
      const ping = pingDatabase(100);
      const assertion = expect(ping).rejects.toThrow("timed out");
      await vi.advanceTimersByTimeAsync(100);
      await assertion;

      rejectQuery(new Error("late failure"));
      vi.useRealTimers();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off("unhandledRejection", unhandled);
    }
  });
});
