import { z } from "zod";

// Server-only: this reads `process.env` and the parsed result includes DATABASE_URL (a secret).
// Never import it from a client component.

export type EnvMode = "build" | "runtime" | "lenient";

export type Env = {
  /** Public origin (plus optional path prefix) used in short links; no trailing slash. */
  BASE_URL: string;
  /** Postgres connection string. Only guaranteed to be present in `runtime` mode. */
  DATABASE_URL: string | undefined;
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

/**
 * True for names that reach this machine: localhost and *.localhost, 127.0.0.0/8, 0.0.0.0, ::1, ::
 * and the IPv4-mapped forms of those. Parsing as an http URL first canonicalizes spellings such as
 * 127.1, 0x7f.0.0.1, 2130706433 and 0:0:0:0:0:0:0:1.
 */
function isLocalHost(host: string): boolean {
  let name = host.toLowerCase();
  const bracketed = name.includes(":") && !name.startsWith("[") ? `[${name}]` : name;
  try {
    name = new URL(`http://${bracketed}`).hostname;
  } catch {
    // Not a valid http host: compare the raw name.
  }
  name = name.replace(/^\[(.*)\]$/, "$1").replace(/\.$/, "");
  return (
    name === "localhost" ||
    name.endsWith(".localhost") ||
    /^127\.\d+\.\d+\.\d+$/.test(name) ||
    name === "0.0.0.0" ||
    name === "::1" ||
    name === "::" ||
    /^::ffff:(7f[0-9a-f]{2}:[0-9a-f]{1,4}|0:0)$/.test(name)
  );
}

/**
 * The server host node-postgres would connect to, read the way it reads a connection string: a
 * `host` query parameter wins over the authority, an empty host stays empty (the driver then uses
 * its local default) and a leading "/" is a Unix socket directory. Undefined when unparseable.
 * Parse errors are discarded, never surfaced: they could echo the password.
 */
function databaseHost(raw: string): string | undefined {
  let url: URL;
  let emptyAuthorityHost = false;
  try {
    url = new URL(raw);
  } catch {
    try {
      // `postgres://user:pass@/db?host=...` has credentials but no host, which URL rejects.
      url = new URL(raw.replace("@/", "@placeholder.invalid/"));
      emptyAuthorityHost = true;
    } catch {
      return undefined;
    }
  }
  const fromQuery = url.searchParams.get("host");
  if (fromQuery) return fromQuery;
  if (emptyAuthorityHost) return "";
  try {
    return decodeURIComponent(url.hostname.replace(/^\[(.+)\]$/, "$1"));
  } catch {
    return undefined;
  }
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
  // Shape only, via a regex: a parser's error message could echo the secret. The production host
  // check parses it separately and discards any parse error.
  .regex(/^postgres(ql)?:\/\//, { error: "must start with postgres:// or postgresql://" });

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
    if (host === "" || host.startsWith("/") || isLocalHost(host)) {
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

type SchemaContext = { onVercel: boolean; allowLocal: boolean };

function buildSchema(mode: EnvMode, { onVercel, allowLocal }: SchemaContext) {
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
  const result = buildSchema(mode, { onVercel, allowLocal }).safeParse({
    BASE_URL: source.BASE_URL,
    DATABASE_URL: source.DATABASE_URL,
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
