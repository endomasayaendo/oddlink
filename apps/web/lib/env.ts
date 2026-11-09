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
  /** HMAC key for reroll tokens. Only guaranteed to be present in `runtime` and `lenient` modes. */
  LINK_SIGNING_SECRET: string | undefined;
};

type EnvSource = Record<string, string | undefined>;

const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_TIME_ZONE = "Asia/Tokyo";
// Dev and tests only: a fixed, public key, so tokens survive dev server restarts. Production must set its own.
const DEV_LINK_SIGNING_SECRET = "oddlink-dev-only-link-signing-secret-do-not-use-in-production";
export const LINK_SIGNING_SECRET_MIN_LENGTH = 32;

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
  // Deliberately not parsed with `new URL()`: a parse error message could echo the secret.
  .regex(/^postgres(ql)?:\/\//, { error: "must start with postgres:// or postgresql://" });

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

// The message must never include the value: it is a key.
const signingSecretValue = z.string().refine((value) => value.length >= LINK_SIGNING_SECRET_MIN_LENGTH, {
  error: `must be at least ${LINK_SIGNING_SECRET_MIN_LENGTH} characters (generate one with: openssl rand -base64 32)`,
});

function buildSchema(mode: EnvMode) {
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
    APP_TIME_ZONE: z.preprocess(emptyAsUnset, timeZoneValue.default(DEFAULT_TIME_ZONE)),
    LINK_SIGNING_SECRET: z.preprocess(
      emptyAsUnset,
      mode === "runtime"
        ? requiredWhen(mode, "LINK_SIGNING_SECRET").pipe(signingSecretValue)
        : mode === "lenient"
          ? signingSecretValue.default(DEV_LINK_SIGNING_SECRET)
          : signingSecretValue.optional(),
    ),
  });
}

/**
 * Validates the environment and throws one Error listing every problem. Messages are built from
 * issue paths and our own text only, never from the input values: DATABASE_URL holds a password
 * and LINK_SIGNING_SECRET is a key.
 */
export function parseEnv(source: EnvSource, mode: EnvMode): Env {
  const result = buildSchema(mode).safeParse({
    BASE_URL: source.BASE_URL,
    DATABASE_URL: source.DATABASE_URL,
    APP_TIME_ZONE: source.APP_TIME_ZONE,
    LINK_SIGNING_SECRET: source.LINK_SIGNING_SECRET,
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
