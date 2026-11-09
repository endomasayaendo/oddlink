import { afterEach, describe, expect, it, vi } from "vitest";

// getEnv() memoizes per module instance, so each case loads a fresh copy after stubbing the env.
async function load() {
  vi.resetModules();
  return (await import("@/lib/check-env-at-startup")).checkEnvAtStartup;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("checkEnvAtStartup", () => {
  it("logs every problem and exits 1 in production, without echoing DATABASE_URL", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PHASE", "phase-production-server");
    vi.stubEnv("BASE_URL", "");
    vi.stubEnv("DATABASE_URL", "mysql://app:s3cr3t-pa55@db.example.com/oddlink");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});

    (await load())();

    expect(exit).toHaveBeenCalledWith(1);
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("- BASE_URL:");
    expect(output).toContain("- DATABASE_URL:");
    expect(output).not.toContain("s3cr3t-pa55");
  });

  it("rethrows instead of exiting outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("BASE_URL", "ftp://example.com");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    const check = await load();
    expect(check).toThrow("- BASE_URL:");
    expect(exit).not.toHaveBeenCalled();
  });

  it("does nothing when the production environment is valid", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("BASE_URL", "https://oddl.ink");
    vi.stubEnv("DATABASE_URL", "postgres://u:p@h/db");
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);

    (await load())();
    expect(exit).not.toHaveBeenCalled();
  });
});
