import { describe, expect, it } from "vitest";
import { parseEnv, resolveMode } from "@/lib/env";

const PASSWORD = "s3cr3t-pa55";
const validDb = `postgres://app:${PASSWORD}@db.example.com:5432/oddlink`;
const SB_KEY = "AIzaSyTestSafeBrowsingKey-123";
const RL_SECRET = "rl-secret-0123456789abcdef0123456789abcdef";
const runtimeEnv = {
  BASE_URL: "https://oddl.ink",
  DATABASE_URL: validDb,
  SAFE_BROWSING_API_KEY: SB_KEY,
  RATE_LIMIT_SECRET: RL_SECRET,
  ISSUE_RATE_LIMIT_MAX: "7",
  ISSUE_RATE_LIMIT_WINDOW_SECONDS: "90",
};
const devRateLimit = {
  RATE_LIMIT_SECRET: "dev-only-rate-limit-secret-do-not-use-in-production",
  ISSUE_RATE_LIMIT_MAX: 100,
  ISSUE_RATE_LIMIT_WINDOW_SECONDS: 60,
};

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
      SAFE_BROWSING_API_KEY: SB_KEY,
      RATE_LIMIT_SECRET: RL_SECRET,
      ISSUE_RATE_LIMIT_MAX: 7,
      ISSUE_RATE_LIMIT_WINDOW_SECONDS: 90,
    });
  });

  it("requires BASE_URL, DATABASE_URL and SAFE_BROWSING_API_KEY at runtime and lists all three", () => {
    const message = messageOf(() => parseEnv({}, "runtime"));
    expect(message).toMatch(/^Invalid environment variables:/);
    expect(message).toContain("- BASE_URL:");
    expect(message).toContain("- DATABASE_URL:");
    expect(message).toContain("- SAFE_BROWSING_API_KEY: is required in production (SAFE_BROWSING_API_KEY is not set)");
  });

  it("lists only the missing variable", () => {
    const message = messageOf(() => parseEnv({ ...runtimeEnv, BASE_URL: undefined }, "runtime"));
    expect(message).toContain("- BASE_URL:");
    expect(message).not.toContain("- DATABASE_URL:");
    expect(message).not.toContain("- SAFE_BROWSING_API_KEY:");
  });

  it("makes SAFE_BROWSING_API_KEY optional in build and lenient modes", () => {
    for (const mode of ["build", "lenient"] as const) {
      expect(parseEnv({}, mode).SAFE_BROWSING_API_KEY).toBeUndefined();
      expect(parseEnv({ SAFE_BROWSING_API_KEY: "" }, mode).SAFE_BROWSING_API_KEY).toBeUndefined();
      expect(parseEnv({ SAFE_BROWSING_API_KEY: SB_KEY }, mode).SAFE_BROWSING_API_KEY).toBe(SB_KEY);
    }
    expect(() => parseEnv({ ...runtimeEnv, SAFE_BROWSING_API_KEY: "" }, "runtime")).toThrow(
      "- SAFE_BROWSING_API_KEY:",
    );
  });

  it("treats empty strings as missing", () => {
    const message = messageOf(() => parseEnv({ BASE_URL: "", DATABASE_URL: "" }, "runtime"));
    expect(message).toContain("- BASE_URL:");
    expect(message).toContain("- DATABASE_URL:");
    expect(parseEnv({ BASE_URL: "", APP_TIME_ZONE: "" }, "lenient")).toEqual({
      BASE_URL: "http://localhost:3000",
      DATABASE_URL: undefined,
      APP_TIME_ZONE: "Asia/Tokyo",
      SAFE_BROWSING_API_KEY: undefined,
      ...devRateLimit,
    });
  });

  it("falls back to defaults in build and lenient modes", () => {
    for (const mode of ["build", "lenient"] as const) {
      expect(parseEnv({}, mode)).toEqual({
        BASE_URL: "http://localhost:3000",
        DATABASE_URL: undefined,
        APP_TIME_ZONE: "Asia/Tokyo",
        SAFE_BROWSING_API_KEY: undefined,
        ...devRateLimit,
      });
    }
  });

  it("still rejects malformed values in build mode", () => {
    expect(() => parseEnv({ BASE_URL: "not a url" }, "build")).toThrow("- BASE_URL:");
    expect(() => parseEnv({ DATABASE_URL: "mysql://x" }, "build")).toThrow("- DATABASE_URL:");
    expect(() => parseEnv({ APP_TIME_ZONE: "Mars/Olympus" }, "build")).toThrow("- APP_TIME_ZONE:");
  });
});

describe("rate limit", () => {
  const names = ["RATE_LIMIT_SECRET", "ISSUE_RATE_LIMIT_MAX", "ISSUE_RATE_LIMIT_WINDOW_SECONDS"] as const;

  it("requires all three at runtime", () => {
    for (const name of names) {
      const message = messageOf(() => parseEnv({ ...runtimeEnv, [name]: undefined }, "runtime"));
      expect(message).toContain(`- ${name}: is required in production (${name} is not set)`);
      expect(messageOf(() => parseEnv({ ...runtimeEnv, [name]: "" }, "runtime"))).toContain(`- ${name}:`);
    }
  });

  it("falls back to dev-only defaults in build and lenient modes", () => {
    for (const mode of ["build", "lenient"] as const) {
      expect(parseEnv({}, mode)).toMatchObject(devRateLimit);
      expect(parseEnv({ ISSUE_RATE_LIMIT_MAX: "3" }, mode).ISSUE_RATE_LIMIT_MAX).toBe(3);
    }
  });

  it.each(["0", "-1", "1.5", "1e3", "abc", " 5", "0x10", "2147483647", "99999999999"])(
    "rejects %j as a limit or window",
    (value) => {
      for (const name of ["ISSUE_RATE_LIMIT_MAX", "ISSUE_RATE_LIMIT_WINDOW_SECONDS"] as const) {
        for (const mode of ["runtime", "lenient"] as const) {
          expect(() => parseEnv({ ...runtimeEnv, [name]: value }, mode)).toThrow(`- ${name}:`);
        }
      }
    },
  );

  it("parses limits as integers", () => {
    const env = parseEnv({ ...runtimeEnv, ISSUE_RATE_LIMIT_MAX: "1", ISSUE_RATE_LIMIT_WINDOW_SECONDS: "007" }, "runtime");
    expect(env.ISSUE_RATE_LIMIT_MAX).toBe(1);
    expect(env.ISSUE_RATE_LIMIT_WINDOW_SECONDS).toBe(7);
  });

  it("rejects a short or whitespace-containing secret", () => {
    expect(() => parseEnv({ ...runtimeEnv, RATE_LIMIT_SECRET: "too-short" }, "runtime")).toThrow("at least 32");
    expect(() => parseEnv({ ...runtimeEnv, RATE_LIMIT_SECRET: `${RL_SECRET} x` }, "runtime")).toThrow("whitespace");
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
    expect(parseEnv({ BASE_URL: "http://localhost:3000/" }, "lenient").BASE_URL).toBe(
      "http://localhost:3000",
    );
  });

  it("returns the normalized URL, not the raw string", () => {
    expect(parse(" https://example.com\n")).toBe("https://example.com");
    expect(parse("https:\\\\example.com\\app")).toBe("https://example.com/app");
    expect(parse("HTTPS://Example.COM:443/")).toBe("https://example.com");
    expect(parse("https://example.com/a b/")).toBe("https://example.com/a%20b");
  });
});

describe("production-only URL rules", () => {
  // The values a developer would copy from .env.example.
  const localEnv = {
    ...runtimeEnv,
    BASE_URL: "http://localhost:3000",
    DATABASE_URL: `postgres://postgres:${PASSWORD}@localhost:5432/oddlink`,
  };
  const baseUrlError = (BASE_URL: string) =>
    messageOf(() => parseEnv({ ...runtimeEnv, BASE_URL }, "runtime"));
  const databaseUrlError = (DATABASE_URL: string) =>
    messageOf(() => parseEnv({ ...runtimeEnv, DATABASE_URL }, "runtime"));

  it("rejects the .env.example values at runtime, listing both variables with every other problem", () => {
    const message = messageOf(() =>
      parseEnv({ ...localEnv, SAFE_BROWSING_API_KEY: undefined }, "runtime"),
    );
    expect(message).toContain("- BASE_URL: must use https in production");
    expect(message).toContain("- BASE_URL: must not point to localhost or a loopback address");
    expect(message).toContain("- DATABASE_URL: must not point to localhost");
    expect(message).toContain("- SAFE_BROWSING_API_KEY:");
    expect(message).toContain("ALLOW_LOCAL_PRODUCTION=1");
  });

  it("still accepts the .env.example values in build and lenient modes", () => {
    for (const mode of ["build", "lenient"] as const) {
      expect(parseEnv(localEnv, mode)).toMatchObject({
        BASE_URL: "http://localhost:3000",
        DATABASE_URL: localEnv.DATABASE_URL,
      });
    }
  });

  it("requires https for BASE_URL at runtime, even on a public host", () => {
    const message = baseUrlError("http://oddl.ink");
    expect(message).toContain("- BASE_URL: must use https in production");
    expect(message).not.toContain("loopback");
  });

  it.each([
    "https://localhost",
    "https://localhost:3000/app",
    "https://LOCALHOST.",
    "https://app.localhost",
    "https://127.0.0.1",
    "https://127.255.0.9:8443",
    "https://127.1",
    "https://0x7f.0.0.1",
    "https://2130706433",
    "https://0.0.0.0",
    "https://[::1]:3000",
    "https://[0:0:0:0:0:0:0:1]",
    "https://[::]",
    "https://[::ffff:127.0.0.1]",
  ])("rejects BASE_URL %s at runtime", (value) => {
    const message = baseUrlError(value);
    expect(message).toContain("- BASE_URL: must not point to localhost or a loopback address");
    expect(message).not.toContain("https in production");
  });

  it.each([
    "https://oddl.ink",
    "https://localhost.example.com",
    "https://notlocalhost.dev",
    "https://128.0.0.1",
    "https://10.0.0.1",
    "https://[2001:db8::1]",
  ])("accepts BASE_URL %s at runtime", (BASE_URL) => {
    expect(() => parseEnv({ ...runtimeEnv, BASE_URL }, "runtime")).not.toThrow();
  });

  it.each([
    "postgres://u:p@localhost:5432/db",
    "postgresql://u:p@LocalHost/db",
    "postgres://u:p@db.localhost/db",
    "postgres://u:p@127.0.0.1:5432/db",
    "postgres://u:p@127.1/db",
    "postgres://u:p@[::1]:5432/db",
    "postgres://u:p@0.0.0.0/db",
    "postgres:///db",
    "postgres://u:p@/db?host=/var/run/postgresql",
    "postgres://u:p@%2Fvar%2Frun%2Fpostgresql/db",
    "postgres://u:p@db.example.com/db?host=localhost",
  ])("rejects DATABASE_URL %s at runtime", (value) => {
    expect(databaseUrlError(value)).toContain(
      "- DATABASE_URL: must not point to localhost, a loopback address or a Unix socket",
    );
  });

  it.each([
    "postgres://u:p@db.example.com:5432/db",
    "postgres://u:p@db:5432/db",
    "postgres://u:p@localhost/db?host=db.example.com",
    "postgresql://u:p@[2001:db8::1]/db?sslmode=require",
  ])("accepts DATABASE_URL %s at runtime", (DATABASE_URL) => {
    expect(() => parseEnv({ ...runtimeEnv, DATABASE_URL }, "runtime")).not.toThrow();
  });

  it("rejects a DATABASE_URL it cannot read a host from, without echoing it", () => {
    const message = databaseUrlError(`postgres://app:${PASSWORD}@bad host/oddlink`);
    expect(message).toContain("- DATABASE_URL: must be a valid connection URL");
    expect(message).not.toContain(PASSWORD);
    expect(message).not.toContain("bad host");
  });

  it("never echoes the rejected values", () => {
    const message = messageOf(() =>
      parseEnv({ ...localEnv, BASE_URL: "http://127.0.0.1:4321/secret-path" }, "runtime"),
    );
    expect(message).not.toContain(PASSWORD);
    expect(message).not.toContain("4321");
    expect(message).not.toContain("secret-path");
    expect(message).not.toContain("postgres://");
  });
});

describe("ALLOW_LOCAL_PRODUCTION", () => {
  const localEnv = {
    ...runtimeEnv,
    BASE_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://postgres:postgres@localhost:5432/oddlink",
  };

  it("lets a runtime process use local http URLs when set to 1, and is not part of the result", () => {
    expect(parseEnv({ ...localEnv, ALLOW_LOCAL_PRODUCTION: "1" }, "runtime")).toEqual({
      BASE_URL: "http://localhost:3000",
      DATABASE_URL: "postgres://postgres:postgres@localhost:5432/oddlink",
      APP_TIME_ZONE: "Asia/Tokyo",
      SAFE_BROWSING_API_KEY: SB_KEY,
      RATE_LIMIT_SECRET: RL_SECRET,
      ISSUE_RATE_LIMIT_MAX: 7,
      ISSUE_RATE_LIMIT_WINDOW_SECONDS: 90,
    });
  });

  it("keeps every other runtime rule", () => {
    const message = messageOf(() =>
      parseEnv(
        {
          ALLOW_LOCAL_PRODUCTION: "1",
          BASE_URL: "ftp://localhost",
          DATABASE_URL: "mysql://localhost/db",
        },
        "runtime",
      ),
    );
    expect(message).toContain("- BASE_URL: must use http or https");
    expect(message).toContain("- DATABASE_URL: must start with postgres://");
    expect(message).toContain("- SAFE_BROWSING_API_KEY: is required in production");
    expect(message).toContain("- RATE_LIMIT_SECRET: is required in production");
  });

  it.each(["true", "yes", "0", " 1"])("rejects %j and keeps the local rules", (value) => {
    const message = messageOf(() =>
      parseEnv({ ...localEnv, ALLOW_LOCAL_PRODUCTION: value }, "runtime"),
    );
    expect(message).toContain("- ALLOW_LOCAL_PRODUCTION: must be 1 or unset");
    expect(message).toContain("- BASE_URL: must use https in production");
    expect(message).toContain("- DATABASE_URL: must not point to localhost");
  });

  it("treats an empty value as unset", () => {
    const message = messageOf(() =>
      parseEnv({ ...localEnv, ALLOW_LOCAL_PRODUCTION: "" }, "runtime"),
    );
    expect(message).not.toContain("- ALLOW_LOCAL_PRODUCTION:");
    expect(message).toContain("- BASE_URL: must use https in production");
  });

  it.each([{ VERCEL: "1" }, { VERCEL_ENV: "production" }, { VERCEL_ENV: "preview" }])(
    "is refused on Vercel (%j) and the local rules still apply",
    (vercel) => {
      const message = messageOf(() =>
        parseEnv({ ...localEnv, ...vercel, ALLOW_LOCAL_PRODUCTION: "1" }, "runtime"),
      );
      expect(message).toContain("- ALLOW_LOCAL_PRODUCTION: must not be set on Vercel");
      expect(message).toContain("- BASE_URL: must use https in production");
      expect(message).toContain("- DATABASE_URL: must not point to localhost");
    },
  );

  it("fails a Vercel build that sets it, before anything is deployed", () => {
    expect(() =>
      parseEnv({ VERCEL: "1", ALLOW_LOCAL_PRODUCTION: "1" }, "build"),
    ).toThrow("- ALLOW_LOCAL_PRODUCTION: must not be set on Vercel");
  });

  it("is ignored and accepted in lenient mode, on Vercel or not", () => {
    for (const source of [{}, { VERCEL: "1" }]) {
      expect(() =>
        parseEnv({ ...source, ALLOW_LOCAL_PRODUCTION: "1" }, "lenient"),
      ).not.toThrow();
    }
  });

  it("does not affect a valid production environment", () => {
    expect(parseEnv({ ...runtimeEnv, ALLOW_LOCAL_PRODUCTION: "1" }, "runtime").BASE_URL).toBe(
      "https://oddl.ink",
    );
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

  it("never echoes SAFE_BROWSING_API_KEY, valid or malformed", () => {
    for (const mode of ["build", "runtime", "lenient"] as const) {
      const bad = `${SB_KEY} with spaces`;
      const message = messageOf(() => parseEnv({ ...runtimeEnv, SAFE_BROWSING_API_KEY: bad }, mode));
      expect(message).toContain("- SAFE_BROWSING_API_KEY:");
      expect(message).not.toContain(SB_KEY);
    }
    const message = messageOf(() => parseEnv({ ...runtimeEnv, BASE_URL: "ftp://x" }, "runtime"));
    expect(message).not.toContain(SB_KEY);
  });

  it("never echoes RATE_LIMIT_SECRET, valid or malformed", () => {
    for (const mode of ["build", "runtime", "lenient"] as const) {
      for (const bad of [`${RL_SECRET} with spaces`, RL_SECRET.slice(0, 20)]) {
        const message = messageOf(() => parseEnv({ ...runtimeEnv, RATE_LIMIT_SECRET: bad }, mode));
        expect(message).toContain("- RATE_LIMIT_SECRET:");
        expect(message).not.toContain(bad);
        expect(message).not.toContain(RL_SECRET.slice(0, 20));
      }
    }
    const message = messageOf(() => parseEnv({ ...runtimeEnv, BASE_URL: "ftp://x" }, "runtime"));
    expect(message).not.toContain(RL_SECRET);
  });
});
