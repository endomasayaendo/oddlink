import { describe, expect, it } from "vitest";
import { parseEnv, resolveMode } from "@/lib/env";

const PASSWORD = "s3cr3t-pa55";
const validDb = `postgres://app:${PASSWORD}@db.example.com:5432/oddlink`;
const runtimeEnv = { BASE_URL: "https://oddl.ink", DATABASE_URL: validDb };

function messageOf(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    return (error as Error).message;
  }
  throw new Error("expected the call to throw");
}

describe("resolveMode", () => {
  it("is build during next build, even though NODE_ENV is production", () => {
    expect(resolveMode({ NEXT_PHASE: "phase-production-build", NODE_ENV: "production" })).toBe(
      "build",
    );
  });

  it("is runtime for a production process outside the build phase", () => {
    expect(resolveMode({ NODE_ENV: "production" })).toBe("runtime");
    expect(resolveMode({ NODE_ENV: "production", NEXT_PHASE: "phase-production-server" })).toBe(
      "runtime",
    );
  });

  it("is lenient for development, test and an unset NODE_ENV", () => {
    expect(resolveMode({ NODE_ENV: "development" })).toBe("lenient");
    expect(resolveMode({ NODE_ENV: "test" })).toBe("lenient");
    expect(resolveMode({})).toBe("lenient");
  });
});

describe("required values", () => {
  it("accepts a complete runtime environment", () => {
    expect(parseEnv(runtimeEnv, "runtime")).toEqual({
      BASE_URL: "https://oddl.ink",
      DATABASE_URL: validDb,
      APP_TIME_ZONE: "Asia/Tokyo",
    });
  });

  it("requires BASE_URL and DATABASE_URL at runtime and lists both", () => {
    const message = messageOf(() => parseEnv({}, "runtime"));
    expect(message).toMatch(/^Invalid environment variables:/);
    expect(message).toContain("- BASE_URL:");
    expect(message).toContain("- DATABASE_URL:");
  });

  it("lists only the missing variable", () => {
    const message = messageOf(() => parseEnv({ DATABASE_URL: validDb }, "runtime"));
    expect(message).toContain("- BASE_URL:");
    expect(message).not.toContain("- DATABASE_URL:");
  });

  it("treats empty strings as missing", () => {
    const message = messageOf(() => parseEnv({ BASE_URL: "", DATABASE_URL: "" }, "runtime"));
    expect(message).toContain("- BASE_URL:");
    expect(message).toContain("- DATABASE_URL:");
    expect(parseEnv({ BASE_URL: "", APP_TIME_ZONE: "" }, "lenient")).toEqual({
      BASE_URL: "http://localhost:3000",
      DATABASE_URL: undefined,
      APP_TIME_ZONE: "Asia/Tokyo",
    });
  });

  it("falls back to defaults in build and lenient modes", () => {
    for (const mode of ["build", "lenient"] as const) {
      expect(parseEnv({}, mode)).toEqual({
        BASE_URL: "http://localhost:3000",
        DATABASE_URL: undefined,
        APP_TIME_ZONE: "Asia/Tokyo",
      });
    }
  });

  it("still rejects malformed values in build mode", () => {
    expect(() => parseEnv({ BASE_URL: "not a url" }, "build")).toThrow("- BASE_URL:");
    expect(() => parseEnv({ DATABASE_URL: "mysql://x" }, "build")).toThrow("- DATABASE_URL:");
    expect(() => parseEnv({ APP_TIME_ZONE: "Mars/Olympus" }, "build")).toThrow("- APP_TIME_ZONE:");
  });
});

describe("BASE_URL", () => {
  const parse = (BASE_URL: string) => parseEnv({ ...runtimeEnv, BASE_URL }, "runtime").BASE_URL;

  it.each([
    ["ftp://example.com", "http or https"],
    ["javascript:alert(1)", "http or https"],
    ["https://user:pass@example.com", "credentials"],
    ["https://user@example.com", "credentials"],
    ["https://example.com?x=1", "query"],
    ["https://example.com/#frag", "fragment"],
    ["/relative", "absolute"],
    ["example.com", "http"],
  ])("rejects %s", (value, hint) => {
    expect(messageOf(() => parse(value))).toContain(hint);
  });

  it("strips every trailing slash and keeps a path prefix", () => {
    expect(parse("https://example.com/")).toBe("https://example.com");
    expect(parse("https://example.com///")).toBe("https://example.com");
    expect(parse("https://example.com/app/")).toBe("https://example.com/app");
    expect(parse("http://localhost:3000")).toBe("http://localhost:3000");
  });
});

describe("APP_TIME_ZONE", () => {
  const parse = (APP_TIME_ZONE: string) =>
    parseEnv({ ...runtimeEnv, APP_TIME_ZONE }, "runtime").APP_TIME_ZONE;

  it.each(["UTC", "Asia/Tokyo", "Asia/Calcutta", "America/New_York"])("accepts %s", (zone) => {
    expect(parse(zone)).toBe(zone);
  });

  it.each(["Mars/Olympus", "+09:00", "-05:00", "+9", "JST-9x", ""])("rejects %j", (zone) => {
    // "" falls back to the default, so it is the only one that must not throw.
    if (zone === "") expect(parse(zone)).toBe("Asia/Tokyo");
    else expect(() => parse(zone)).toThrow("- APP_TIME_ZONE:");
  });
});

describe("DATABASE_URL", () => {
  const parse = (DATABASE_URL: string) =>
    parseEnv({ ...runtimeEnv, DATABASE_URL }, "runtime").DATABASE_URL;

  it("accepts postgres:// and postgresql://", () => {
    expect(parse("postgres://u:p@h/db")).toBe("postgres://u:p@h/db");
    expect(parse("postgresql://u:p@h/db")).toBe("postgresql://u:p@h/db");
  });

  it.each(["mysql://u:p@h/db", "http://h", "localhost:5432/db", "Postgres://h"])(
    "rejects %s",
    (value) => {
      expect(() => parse(value)).toThrow("- DATABASE_URL:");
    },
  );
});

describe("secret redaction", () => {
  it("never echoes a malformed DATABASE_URL, which may hold a password", () => {
    const bad = `mysql://app:${PASSWORD}@db.example.com/oddlink`;
    for (const mode of ["build", "runtime", "lenient"] as const) {
      const message = messageOf(() => parseEnv({ ...runtimeEnv, DATABASE_URL: bad }, mode));
      expect(message).toContain("- DATABASE_URL:");
      expect(message).not.toContain(PASSWORD);
      expect(message).not.toContain("db.example.com");
    }
  });

  it("does not leak a valid DATABASE_URL when another variable is invalid", () => {
    const message = messageOf(() => parseEnv({ ...runtimeEnv, BASE_URL: "ftp://x" }, "runtime"));
    expect(message).not.toContain(PASSWORD);
  });
});
