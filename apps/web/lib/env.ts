import { X509Certificate } from "node:crypto";
import { z } from "zod";
import { databaseHost, isLocalDatabaseHost, tlsQueryParams } from "@/lib/db/connection-url";

// Server-only: this reads `process.env` and the parsed result includes DATABASE_URL (a secret).
// Never import it from a client component.

export type EnvMode = "build" | "runtime" | "lenient";

export type Env = {
  /** Public origin (plus optional path prefix) used in short links; no trailing slash. */
  BASE_URL: string;
  /** Postgres connection string. Only guaranteed to be present in `runtime` mode. */
  DATABASE_URL: string | undefined;
  /**
   * PEM CA certificate(s) the database server certificate must chain to, normalized to plain PEM.
   * Set: connect over TLS and verify the certificate and host name. Unset: connect without TLS,
   * which is only accepted for a database on this machine.
   */
  DATABASE_CA_CERT: string | undefined;
  /** IANA time zone used for daily click counts. */
  APP_TIME_ZONE: string;
  /** Google Safe Browsing API key (secret). Only guaranteed to be present in `runtime` mode. */
  SAFE_BROWSING_API_KEY: string | undefined;
  /** HMAC key for rate-limit client keys (secret). Falls back to a dev-only value outside `runtime`. */
  RATE_LIMIT_SECRET: string;
  /** Link issues allowed per client per window. */
  ISSUE_RATE_LIMIT_MAX: number;
  /** Length of the issue rate-limit window, in seconds. */
  ISSUE_RATE_LIMIT_WINDOW_SECONDS: number;
};

type EnvSource = Record<string, string | undefined>;

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_TIME_ZONE = "Asia/Tokyo";
// Dev and test only: production must set all three (the real thresholds live outside the repository).
const DEV_RATE_LIMIT_SECRET = "dev-only-rate-limit-secret-do-not-use-in-production";
const DEV_ISSUE_RATE_LIMIT_MAX = 100;
const DEV_ISSUE_RATE_LIMIT_WINDOW_SECONDS = 60;

/**
 * - `build`: `next build` (Next sets NEXT_PHASE during it, and build workers inherit it). CI builds
 *   without DATABASE_URL on purpose, so missing values are tolerated.
 * - `runtime`: `next start` or any other production process. Missing required values are errors.
 * - `lenient`: dev and tests. Missing values fall back to local defaults.
 *
 * The literal below is `PHASE_PRODUCTION_BUILD` from `next/constants`; it is inlined to keep this
 * module free of Next imports so Vitest can load it directly.
 */
export function resolveMode(source: EnvSource): EnvMode {
  if (source.NEXT_PHASE === "phase-production-build") return "build";
  if (source.NODE_ENV === "production") return "runtime";
  return "lenient";
}

// Treat an empty string (`BASE_URL=` in a .env file) as unset.
const emptyAsUnset = (value: unknown) => (value === "" ? undefined : value);

function requiredWhen(mode: EnvMode, name: string) {
  return z.string({
    error: (issue) =>
      issue.input === undefined
        ? mode === "runtime"
          ? `is required in production (${name} is not set)`
          : "is required"
        : "must be a string",
  });
}

const baseUrlValue = z.string().transform((raw, ctx) => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    ctx.addIssue({ code: "custom", message: "must be an absolute http(s) URL" });
    return z.NEVER;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    ctx.addIssue({ code: "custom", message: "must use http or https" });
    return z.NEVER;
  }
  if (url.username || url.password) {
    ctx.addIssue({ code: "custom", message: "must not contain credentials" });
    return z.NEVER;
  }
  if (url.search || url.hash || raw.includes("?") || raw.includes("#")) {
    ctx.addIssue({ code: "custom", message: "must not contain a query string or fragment" });
    return z.NEVER;
  }
  // Build from the parsed URL, not `raw`: the parser silently strips surrounding whitespace and
  // newlines (common in copied secrets) and rewrites backslashes, which would otherwise leak into
  // every short link. Keep the path prefix (e.g. https://example.com/app) but drop trailing slashes.
  return `${url.origin}${url.pathname}`.replace(/\/+$/, "");
});

const databaseUrlValue = z
  .string()
  // Shape only, via a regex: a parser's error message could echo the secret.
  .regex(/^postgres(ql)?:\/\//, { error: "must start with postgres:// or postgresql://" })
  .superRefine((value, ctx) => {
    // Only parameter names reach the message, never their values or the rest of the URL.
    const params = tlsQueryParams(value);
    if (params.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `must not set TLS options in the query string (found: ${[...new Set(params)].join(", ")}); TLS is configured by DATABASE_CA_CERT`,
      });
    }
  });

const PEM_BLOCK = /-----BEGIN ([A-Z0-9 ]+)-----[\s\S]*?-----END \1-----/g;

/**
 * Accepts PEM text (real newlines, or literal "\n" for single-line settings) or the PEM base64
 * encoded as a whole. Returns the certificates as plain PEM. Messages never include the value.
 */
const caCertValue = z.string().transform((raw, ctx) => {
  let pem = raw.trim();
  if (!pem.includes("-----BEGIN")) {
    const compact = pem.replace(/\s+/g, "");
    pem = /^[A-Za-z0-9+/]+={0,2}$/.test(compact)
      ? Buffer.from(compact, "base64").toString("utf8")
      : "";
  }
  pem = pem.replace(/\\r\\n|\\n/g, "\n").replace(/\r\n/g, "\n");
  if (/PRIVATE KEY-----/.test(pem)) {
    ctx.addIssue({ code: "custom", message: "must not contain a private key" });
    return z.NEVER;
  }
  const blocks = [...pem.matchAll(PEM_BLOCK)];
  if (blocks.length === 0) {
    ctx.addIssue({
      code: "custom",
      message: "must be a PEM certificate (-----BEGIN CERTIFICATE-----) or its base64 encoding",
    });
    return z.NEVER;
  }
  if (blocks.some((block) => block[1] !== "CERTIFICATE")) {
    ctx.addIssue({ code: "custom", message: "must contain only CERTIFICATE blocks" });
    return z.NEVER;
  }
  for (const [block] of blocks) {
    try {
      new X509Certificate(block);
    } catch {
      ctx.addIssue({ code: "custom", message: "contains a certificate that cannot be parsed" });
      return z.NEVER;
    }
  }
  return blocks.map(([block]) => block).join("\n") + "\n";
});

/**
 * Opt-in for a production process on this machine against a local database (`next build &&
 * next start` with the Docker Postgres), which then may run without DATABASE_CA_CERT. Only the
 * exact value "1" counts, and never when Vercel's system variables are present.
 */
const ALLOW_LOCAL_PRODUCTION = "ALLOW_LOCAL_PRODUCTION";

function isOnVercel(source: EnvSource): boolean {
  return Boolean(source.VERCEL || source.VERCEL_ENV);
}

/** True when production may connect without TLS: opted in, off Vercel, and the database is local. */
function allowsPlaintextDatabase(source: EnvSource): boolean {
  if (source[ALLOW_LOCAL_PRODUCTION] !== "1" || isOnVercel(source)) return false;
  const raw = emptyAsUnset(source.DATABASE_URL);
  if (typeof raw !== "string") return false;
  const host = databaseHost(raw);
  return host !== undefined && isLocalDatabaseHost(host);
}

const timeZoneValue = z.string().refine(
  (value) => {
    // Postgres reads "+09:00" as a POSIX offset with the sign inverted, so only IANA names pass.
    if (/^[+-]/.test(value)) return false;
    try {
      new Intl.DateTimeFormat("en", { timeZone: value });
      return true;
    } catch {
      return false;
    }
  },
  { error: "must be an IANA time zone name such as Asia/Tokyo or UTC" },
);

// Opaque secret: only checked for presence and shape, and never echoed in messages.
const safeBrowsingKeyValue = z.string().regex(/^\S+$/, { error: "must not contain whitespace" });

// Opaque secret like the one above; a short key would make the HMAC easy to brute-force.
const rateLimitSecretValue = z
  .string()
  .regex(/^\S+$/, { error: "must not contain whitespace" })
  .min(32, { error: "must be at least 32 characters" });

// Postgres int4 bounds the stored count (max + 1) and keeps the window interval sane.
const INT4_MAX = 2_147_483_647;
const positiveIntValue = z
  .string()
  .regex(/^[0-9]+$/, { error: "must be a positive integer" })
  .transform(Number)
  .pipe(
    z
      .number()
      .int()
      .min(1, { error: "must be a positive integer" })
      .max(INT4_MAX - 1, { error: "is too large" }),
  );

function buildSchema(mode: EnvMode, { caOptional }: { caOptional: boolean }) {
  const baseUrl =
    mode === "runtime" ? requiredWhen(mode, "BASE_URL").pipe(baseUrlValue) : baseUrlValue;
  const databaseUrl =
    mode === "runtime" ? requiredWhen(mode, "DATABASE_URL").pipe(databaseUrlValue) : databaseUrlValue;

  return z.object({
    BASE_URL: z.preprocess(
      emptyAsUnset,
      mode === "runtime" ? baseUrl : baseUrl.default(DEFAULT_BASE_URL),
    ),
    DATABASE_URL: z.preprocess(
      emptyAsUnset,
      mode === "runtime" ? databaseUrl : databaseUrl.optional(),
    ),
    DATABASE_CA_CERT: z.preprocess(
      emptyAsUnset,
      mode === "runtime" && !caOptional
        ? z
            .string({
              error: (issue) =>
                issue.input === undefined
                  ? `is required in production unless DATABASE_URL is local and ${ALLOW_LOCAL_PRODUCTION}=1 (DATABASE_CA_CERT is not set)`
                  : "must be a string",
            })
            .pipe(caCertValue)
        : caCertValue.optional(),
    ),
    APP_TIME_ZONE: z.preprocess(emptyAsUnset, timeZoneValue.default(DEFAULT_TIME_ZONE)),
    SAFE_BROWSING_API_KEY: z.preprocess(
      emptyAsUnset,
      mode === "runtime"
        ? requiredWhen(mode, "SAFE_BROWSING_API_KEY").pipe(safeBrowsingKeyValue)
        : safeBrowsingKeyValue.optional(),
    ),
    RATE_LIMIT_SECRET: z.preprocess(
      emptyAsUnset,
      mode === "runtime"
        ? requiredWhen(mode, "RATE_LIMIT_SECRET").pipe(rateLimitSecretValue)
        : rateLimitSecretValue.default(DEV_RATE_LIMIT_SECRET),
    ),
    ISSUE_RATE_LIMIT_MAX: z.preprocess(
      emptyAsUnset,
      mode === "runtime"
        ? requiredWhen(mode, "ISSUE_RATE_LIMIT_MAX").pipe(positiveIntValue)
        : positiveIntValue.default(DEV_ISSUE_RATE_LIMIT_MAX),
    ),
    ISSUE_RATE_LIMIT_WINDOW_SECONDS: z.preprocess(
      emptyAsUnset,
      mode === "runtime"
        ? requiredWhen(mode, "ISSUE_RATE_LIMIT_WINDOW_SECONDS").pipe(positiveIntValue)
        : positiveIntValue.default(DEV_ISSUE_RATE_LIMIT_WINDOW_SECONDS),
    ),
  }).superRefine((env, ctx) => {
    // In every mode (dev servers and operator commands included), a database that is not on this
    // machine is only reached over verified TLS, so the password never crosses the network in
    // plain text. A host that cannot be read counts as remote.
    if (env.DATABASE_URL === undefined || env.DATABASE_CA_CERT !== undefined) return;
    const host = databaseHost(env.DATABASE_URL);
    if (host !== undefined && isLocalDatabaseHost(host)) return;
    ctx.addIssue({
      code: "custom",
      path: ["DATABASE_CA_CERT"],
      message: "is required when DATABASE_URL points to a database on another machine (DATABASE_CA_CERT is not set)",
    });
  });
}

/**
 * Validates the environment and throws one Error listing every problem. Messages are built from
 * issue paths and our own text only, never from the input values: DATABASE_URL holds a password, and
 * SAFE_BROWSING_API_KEY and RATE_LIMIT_SECRET are secrets.
 */
export function parseEnv(source: EnvSource, mode: EnvMode): Env {
  const result = buildSchema(mode, { caOptional: allowsPlaintextDatabase(source) }).safeParse({
    BASE_URL: source.BASE_URL,
    DATABASE_URL: source.DATABASE_URL,
    DATABASE_CA_CERT: source.DATABASE_CA_CERT,
    APP_TIME_ZONE: source.APP_TIME_ZONE,
    SAFE_BROWSING_API_KEY: source.SAFE_BROWSING_API_KEY,
    RATE_LIMIT_SECRET: source.RATE_LIMIT_SECRET,
    ISSUE_RATE_LIMIT_MAX: source.ISSUE_RATE_LIMIT_MAX,
    ISSUE_RATE_LIMIT_WINDOW_SECONDS: source.ISSUE_RATE_LIMIT_WINDOW_SECONDS,
  });
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}`);
  }
  return result.data as Env;
}

let cached: Env | undefined;

/** Parsed environment for the current process, validated once. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env, resolveMode(process.env));
  return cached;
}
