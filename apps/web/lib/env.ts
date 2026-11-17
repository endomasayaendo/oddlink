import { X509Certificate } from "node:crypto";
import { z } from "zod";
import { databaseHost, isLocalDatabaseHost, isLocalHost, tlsQueryParams } from "@/lib/db/connection-url";

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
 * - `runtime`: `next start` or any other production process. Missing required values are errors,
 *   and so are local URLs (see `ALLOW_LOCAL_PRODUCTION`).
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

/**
 * Opt-in for running a production build on this machine (`next build && next start`), where
 * BASE_URL and DATABASE_URL point to localhost. Only the exact value "1" enables it, and it is
 * refused whenever Vercel's system variables are present, so it cannot weaken a real deployment.
 */
const ALLOW_LOCAL_PRODUCTION = "ALLOW_LOCAL_PRODUCTION";
const LOCAL_HINT = `(${ALLOW_LOCAL_PRODUCTION}=1 allows this outside Vercel, for a local production run)`;

// Vercel system variables, present in its Production and Preview deployments at build and runtime.
function isOnVercel(source: EnvSource): boolean {
  return Boolean(source.VERCEL || source.VERCEL_ENV);
}

/** True when `raw` is a connection string whose server is on this machine. */
function isLocalDatabaseUrl(raw: string | undefined): boolean {
  if (!raw) return false;
  const host = databaseHost(raw);
  return host !== undefined && isLocalDatabaseHost(host);
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
  // Shape only, via a regex: a parser's error message could echo the secret. The host checks
  // parse it separately and discard any parse error.
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

// Production-only rules, applied after the shape checks above. `allowLocal` lifts them.
function productionBaseUrl(allowLocal: boolean) {
  return z.string().superRefine((value, ctx) => {
    if (allowLocal) return;
    const url = new URL(value);
    if (url.protocol !== "https:") {
      ctx.addIssue({ code: "custom", message: `must use https in production ${LOCAL_HINT}` });
    }
    if (isLocalHost(url.hostname)) {
      ctx.addIssue({
        code: "custom",
        message: `must not point to localhost or a loopback address in production ${LOCAL_HINT}`,
      });
    }
  });
}

function productionDatabaseUrl(allowLocal: boolean) {
  return z.string().superRefine((value, ctx) => {
    const host = databaseHost(value);
    if (host === undefined) {
      ctx.addIssue({ code: "custom", message: "must be a valid connection URL" });
      return;
    }
    if (allowLocal) return;
    if (isLocalDatabaseHost(host)) {
      ctx.addIssue({
        code: "custom",
        message: `must not point to localhost, a loopback address or a Unix socket in production ${LOCAL_HINT}`,
      });
    }
  });
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

type SchemaContext = { onVercel: boolean; allowLocal: boolean; caOptional: boolean };

function buildSchema(mode: EnvMode, { onVercel, allowLocal, caOptional }: SchemaContext) {
  const baseUrl =
    mode === "runtime"
      ? requiredWhen(mode, "BASE_URL").pipe(baseUrlValue).pipe(productionBaseUrl(allowLocal))
      : baseUrlValue;
  const databaseUrl =
    mode === "runtime"
      ? requiredWhen(mode, "DATABASE_URL")
          .pipe(databaseUrlValue)
          .pipe(productionDatabaseUrl(allowLocal))
      : databaseUrlValue;
  const allowLocalProduction = z
    .literal("1", { error: "must be 1 or unset" })
    .refine(() => mode === "lenient" || !onVercel, { error: "must not be set on Vercel" });

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
    [ALLOW_LOCAL_PRODUCTION]: z.preprocess(emptyAsUnset, allowLocalProduction.optional()),
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
  const onVercel = isOnVercel(source);
  const allowLocal = mode === "runtime" && !onVercel && source[ALLOW_LOCAL_PRODUCTION] === "1";
  // A local production run against the Docker Postgres may skip TLS; any other database may not.
  const caOptional = allowLocal && isLocalDatabaseUrl(source.DATABASE_URL);
  const result = buildSchema(mode, { onVercel, allowLocal, caOptional }).safeParse({
    BASE_URL: source.BASE_URL,
    DATABASE_URL: source.DATABASE_URL,
    DATABASE_CA_CERT: source.DATABASE_CA_CERT,
    APP_TIME_ZONE: source.APP_TIME_ZONE,
    SAFE_BROWSING_API_KEY: source.SAFE_BROWSING_API_KEY,
    RATE_LIMIT_SECRET: source.RATE_LIMIT_SECRET,
    ISSUE_RATE_LIMIT_MAX: source.ISSUE_RATE_LIMIT_MAX,
    ISSUE_RATE_LIMIT_WINDOW_SECONDS: source.ISSUE_RATE_LIMIT_WINDOW_SECONDS,
    [ALLOW_LOCAL_PRODUCTION]: source[ALLOW_LOCAL_PRODUCTION],
  });
  if (!result.success) {
    const lines = result.error.issues.map((issue) => `- ${issue.path.join(".")}: ${issue.message}`);
    throw new Error(`Invalid environment variables:\n${lines.join("\n")}`);
  }
  // The opt-in is validated above but is not part of Env.
  return Object.fromEntries(
    Object.entries(result.data).filter(([key]) => key !== ALLOW_LOCAL_PRODUCTION),
  ) as Env;
}

let cached: Env | undefined;

/** Parsed environment for the current process, validated once. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env, resolveMode(process.env));
  return cached;
}
