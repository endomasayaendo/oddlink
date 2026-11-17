import { describe, expect, it } from "vitest";
import { parseEnv, resolveMode } from "@/lib/env";
import { createTlsFixtures } from "./db/tls-fixtures";

const PASSWORD = "s3cr3t-pa55";
const validDb = `postgres://app:${PASSWORD}@db.example.com:5432/oddlink`;
const SB_KEY = "AIzaSyTestSafeBrowsingKey-123";
const RL_SECRET = "rl-secret-0123456789abcdef0123456789abcdef";
const tls = createTlsFixtures();
const CA = tls.caPem;
const runtimeEnv = {
  BASE_URL: "https://oddl.ink",
  DATABASE_URL: validDb,
  DATABASE_CA_CERT: CA,
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
      DATABASE_CA_CERT: CA,
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
    expect(parse("http://localhost:3000")).toBe("http://localhost:3000");
  });

  it("returns the normalized URL, not the raw string", () => {
    expect(parse(" https://example.com\n")).toBe("https://example.com");
    expect(parse("https:\\\\example.com\\app")).toBe("https://example.com/app");
    expect(parse("HTTPS://Example.COM:443/")).toBe("https://example.com");
    expect(parse("https://example.com/a b/")).toBe("https://example.com/a%20b");
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

describe("DATABASE_URL TLS parameters", () => {
  it.each([
    "sslmode=require",
    "sslmode=verify-full",
    "sslmode=disable",
    "sslmode=no-verify",
    "ssl=true",
    "sslrootcert=/tmp/ca.pem",
    "sslnegotiation=direct",
    "uselibpqcompat=true",
    "application_name=x&SSLMODE=require",
  ])("rejects %s in every mode, naming only the parameter", (query) => {
    for (const mode of ["build", "runtime", "lenient"] as const) {
      const message = messageOf(() =>
        parseEnv({ ...runtimeEnv, DATABASE_URL: `${validDb}?${query}` }, mode),
      );
      expect(message).toContain("- DATABASE_URL: must not set TLS options in the query string");
      expect(message).toContain("TLS is configured by DATABASE_CA_CERT");
      expect(message).not.toContain(PASSWORD);
      expect(message).not.toContain("db.example.com");
      expect(message).not.toContain("/tmp/ca.pem");
    }
  });

  it("accepts other query parameters", () => {
    const url = `${validDb}?application_name=oddlink&options=-c%20search_path%3Dpublic`;
    expect(parseEnv({ ...runtimeEnv, DATABASE_URL: url }, "runtime").DATABASE_URL).toBe(url);
  });
});

describe("DATABASE_CA_CERT", () => {
  const parse = (DATABASE_CA_CERT: string | undefined, mode: "build" | "runtime" | "lenient" = "runtime") =>
    parseEnv({ ...runtimeEnv, DATABASE_CA_CERT }, mode).DATABASE_CA_CERT;
  const normalized = CA.trim() + "\n";

  it("accepts PEM text and normalizes it", () => {
    expect(parse(CA)).toBe(normalized);
    expect(parse(`\n  ${CA}  \n`)).toBe(normalized);
    expect(parse(CA.replace(/\n/g, "\r\n"))).toBe(normalized);
  });

  it("accepts PEM on one line with literal \\n escapes", () => {
    expect(parse(CA.trim().replace(/\n/g, "\\n"))).toBe(normalized);
  });

  it("accepts the PEM encoded as base64, wrapped or not", () => {
    const b64 = Buffer.from(CA).toString("base64");
    expect(parse(b64)).toBe(normalized);
    expect(parse(b64.replace(/(.{64})/g, "$1\n"))).toBe(normalized);
  });

  it("accepts a bundle of several certificates", () => {
    const bundle = `${CA}${tls.otherCaPem}`;
    expect(parse(bundle)).toBe(`${CA.trim()}\n${tls.otherCaPem.trim()}\n`);
  });

  it("is required at runtime and lists it with the other missing values", () => {
    const message = messageOf(() => parseEnv({ ...runtimeEnv, DATABASE_CA_CERT: "" }, "runtime"));
    expect(message).toContain(
      "- DATABASE_CA_CERT: is required in production unless DATABASE_URL is local and ALLOW_LOCAL_PRODUCTION=1",
    );
  });

  it("is optional in build and lenient modes, where unset means no TLS", () => {
    for (const mode of ["build", "lenient"] as const) {
      expect(parse(undefined, mode)).toBeUndefined();
      expect(parse("", mode)).toBeUndefined();
      expect(parse(CA, mode)).toBe(normalized);
    }
  });

  describe("ALLOW_LOCAL_PRODUCTION", () => {
    const local = "postgres://postgres:postgres@localhost:5432/oddlink";
    const run = (extra: Record<string, string | undefined>) =>
      parseEnv({ ...runtimeEnv, DATABASE_CA_CERT: undefined, ...extra }, "runtime");

    it.each([
      local,
      "postgres://postgres:postgres@127.0.0.1:5432/oddlink",
      "postgres://postgres:postgres@[::1]:5432/oddlink",
      "postgres://postgres:postgres@/oddlink?host=/var/run/postgresql",
    ])("lets production run without a CA against %s", (DATABASE_URL) => {
      expect(run({ DATABASE_URL, ALLOW_LOCAL_PRODUCTION: "1" }).DATABASE_CA_CERT).toBeUndefined();
    });

    it("still uses the CA when one is set", () => {
      expect(
        run({ DATABASE_URL: local, ALLOW_LOCAL_PRODUCTION: "1", DATABASE_CA_CERT: CA })
          .DATABASE_CA_CERT,
      ).toBe(normalized);
    });

    it("does not apply to a remote database", () => {
      expect(() => run({ ALLOW_LOCAL_PRODUCTION: "1" })).toThrow("- DATABASE_CA_CERT:");
      expect(() =>
        run({ DATABASE_URL: "postgres://u:p@db.example.com/x?host=localhost.example.com", ALLOW_LOCAL_PRODUCTION: "1" }),
      ).toThrow("- DATABASE_CA_CERT:");
    });

    it.each(["true", "yes", "0", " 1"])("only counts the exact value 1 (not %j)", (value) => {
      expect(() => run({ DATABASE_URL: local, ALLOW_LOCAL_PRODUCTION: value })).toThrow(
        "- DATABASE_CA_CERT:",
      );
    });

    it("is ignored on Vercel", () => {
      for (const vercel of [{ VERCEL: "1" }, { VERCEL_ENV: "preview" }]) {
        expect(() => run({ DATABASE_URL: local, ALLOW_LOCAL_PRODUCTION: "1", ...vercel })).toThrow(
          "- DATABASE_CA_CERT:",
        );
      }
    });

    it("is required for a local database too", () => {
      expect(() => run({ DATABASE_URL: local })).toThrow("- DATABASE_CA_CERT:");
    });
  });

  it.each([
    ["not a certificate", "must be a PEM certificate"],
    ["-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----", "contains a certificate that cannot be parsed"],
    ["-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----", "must contain only CERTIFICATE blocks"],
    [Buffer.from("hello").toString("base64"), "must be a PEM certificate"],
  ])("rejects %j in every mode", (value, expected) => {
    for (const mode of ["build", "runtime", "lenient"] as const) {
      expect(() => parse(value, mode)).toThrow(`- DATABASE_CA_CERT: ${expected}`);
    }
  });

  it("refuses a private key without echoing it", () => {
    const withKey = `${CA}${tls.localhost.key}`;
    const message = messageOf(() => parse(withKey));
    expect(message).toContain("- DATABASE_CA_CERT: must not contain a private key");
    expect(message).not.toContain(tls.localhost.key.split("\n")[1]);
    expect(message).not.toContain(CA.split("\n")[1]);
  });
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
