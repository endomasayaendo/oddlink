<div align="center">

<h1>OddLink</h1>

**Where links get odd.**

A URL shortener that generates surreal English phrases as short codes.

`https://example.com/very/long/boring/url`  →  `localhost:3000/golden-clock-whispers-to-silent-butterfly`

</div>

---

## How it works

Every URL gets a unique, poetic short code generated from a vocabulary of adjectives, nouns, verbs, and adverbs:

```
golden-clock-whispers-to-silent-butterfly
river-of-broken-mirror-melts
hollow-tree-slowly-remembers
smoke-gently-carries-blue-key
```

6 phrase patterns. 135 seed words. Endless oddness.

> This is a rewrite of the original Spring Boot + Vite version ([oddlink-spring](https://github.com/endomasayaendo/oddlink-spring)) in Next.js, organized as a monorepo modeled on [dub](https://github.com/dubinc/dub).

---

## Tech Stack

| | |
|---|---|
| **App** | Next.js 16 (App Router) · React 19 · TypeScript |
| **Data** | PostgreSQL 17 (Docker) · Drizzle ORM · drizzle-kit migrations |
| **UI** | Tailwind CSS 4 · Recharts |
| **Validation / Tests** | Zod · Vitest (against a real Postgres test database) |
| **Monorepo** | pnpm workspaces · Turborepo |

---

## Getting Started

**Prerequisites:** Node.js 22.12+ (`.nvmrc` pins 26 — run `nvm use`), pnpm 12 (`npm i -g pnpm`), and Docker **running** (Postgres runs in a container)

```bash
git clone https://github.com/endomasayaendo/oddlink.git
cd oddlink
pnpm bootstrap                           # start: install, set up .env, start Postgres, migrate, run the dev server
pnpm stop                                # stop: the dev server and Postgres (data is kept)
```

Then open http://localhost:3000. `pnpm bootstrap` is safe to run again at any time:

1. Checks that Docker is running (and stops with a clear message if not).
2. Runs `pnpm install --frozen-lockfile` (never rewrites `pnpm-lock.yaml`).
3. Creates `apps/web/.env` from `.env.example` **only if it does not exist**; an existing `.env` is never touched.
4. Starts the `oddlink-db` container and waits until it is healthy. A running container is reused, and a stopped one is started.
5. Runs `pnpm db:migrate`.
6. Starts `pnpm dev`. Pass `--no-dev` to stop after setup instead: `pnpm bootstrap --no-dev`.

To stop, press Ctrl+C in the terminal running the dev server, or run `pnpm stop` from the repository root. `pnpm stop`:

1. Stops the dev server that `pnpm bootstrap` started from this checkout, if it is still running (for example in another terminal). It only signals the process `pnpm bootstrap` recorded, never whatever happens to be on port 3000.
2. Stops the `oddlink-db` container with `docker stop`. The container and its data are kept, and the next `pnpm bootstrap` starts it again.

The `oddlink-db` container is shared by every checkout and worktree on this machine, so stopping it also takes Postgres away from them (their dev servers and tests fail until it is started again). Use `pnpm stop --keep-db` to stop only the dev server.

Before opening a pull request, run `pnpm verify`: it runs what CI runs, in the same order (`lint` → `typecheck` → `build` without `DATABASE_URL` → `test`) and stops at the first failure. It needs Postgres running (`pnpm bootstrap` or `pnpm db:up`) and never starts anything itself.

### Manual setup

If you would rather run the steps yourself, this is all `pnpm bootstrap` does:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env   # defaults work out of the box
pnpm db:up                               # start Postgres
pnpm db:migrate                          # create tables and seed words
pnpm dev                                 # http://localhost:3000
```

If the port is taken, or `pnpm db:up` complains that the name `oddlink-db` is in use, another checkout's database container is probably already running on `localhost:5432`; `pnpm bootstrap` simply reuses it.

---

## Routes

| Route | What it does |
|---|---|
| `/` | Shorten a URL (Server Action) and see your recent links (stored in `localStorage`) |
| `POST /api/issue` | Shorten a URL from anywhere else (see below) |
| `GET /{shortCode}` | Handled in `proxy.ts`: counts and logs the access in one SQL statement, then `302`s to the original URL (`503` if that write fails). Unknown or expired codes get a real `404`; disabled or deleted links get `410 Gone` (a static page, `no-store`, `noindex`, never the destination) |
| `GET /{shortCode}+` | Preview page (rewritten to `/preview/{shortCode}`): shows the destination host and full address, created / expires dates and total clicks, and a "Continue" button that goes through the short link itself. Viewing it never counts as a click. Unknown, unusable or malformed codes get a real `404`; disabled or deleted links get `410 Gone`; expired links get a page with an "Expired" banner and no button. `no-store`, `noindex`. A transparency feature for the person holding the link, not an abuse filter |
| `/analytics/{shortCode}` | Total clicks, created / expires dates, and daily clicks. `proxy.ts` checks the code first so unknown codes get a real `404` and disabled or deleted ones `410 Gone` |

### `POST /api/issue`

```bash
curl -X POST http://localhost:3000/api/issue \
  -H "Content-Type: application/json" \
  -d '{"originalUrl": "https://example.com/some/long/url"}'
```

```json
{
  "shortUrl": "http://localhost:3000/golden-clock-whispers-to-silent-butterfly",
  "originalUrl": "https://example.com/some/long/url"
}
```

The request must be sent with `Content-Type: application/json` (a `charset` parameter is fine); anything else gets `415` before the body is read or the request counts toward the rate limit.

Errors return `{"message": "..."}`: `400` for a blank or invalid URL (only `http`/`https` are accepted), `422` if Google Safe Browsing flags the URL (the body also carries `"advisory": "Advisory provided by Google"` and `"advisoryUrl"`), `429` with a `Retry-After` header (seconds) when the client has issued too many links recently (see [Rate limiting](#rate-limiting)), `503` if no unique phrase could be generated.

### Safe Browsing check

Before issuing, the destination is looked up in [Google Safe Browsing v5](https://developers.google.com/safe-browsing/reference) in [No-Storage Real-Time mode](https://developers.google.com/safe-browsing/reference/No.Storage.Real.Time.Mode): only 4-byte SHA-256 hash prefixes of the URL's host/path expressions are sent, never the URL itself (`apps/web/lib/links/safe-browsing/`). Matches for malware, social engineering, unwanted software and potentially harmful applications are refused. Answers are cached in memory per prefix (at most 30 minutes). If Google is slow (> 1 s), down, rate-limits us, or no key is set, the link is issued anyway (fail open).

Setting up the key: create an API key in the Google Cloud console with the Safe Browsing API enabled, **restrict the key to the Safe Browsing API**, and set `SAFE_BROWSING_API_KEY` for every environment that runs `next start` — on Vercel that includes Preview deployments, not just Production. The Safe Browsing API is for non-commercial use; a commercial OddLink would move to Web Risk.

### Rate limiting

Issuing links is rate-limited in two layers ([ADR 0004](docs/adr/0004-rate-limiting.md)):

1. **Vercel WAF** (deploy-time, coarse): a rate-limit rule keyed by IP on `POST /api/issue` and on Server Action POSTs to `/` (requests carrying a `Next-Action` header). Thresholds are set only in the Vercel dashboard. How many rules the Hobby plan allows is Unverified.
2. **App limiter** (final check, `apps/web/lib/rate-limit/`): a per-client fixed window counted in Postgres (`rate_limits`), shared by the form and the API. Invalid URLs are not counted; URLs Safe Browsing refuses are. Over the limit, the API answers `429` with `Retry-After` and the form shows a message. If the limiter's database query fails, the link is issued anyway (fail open). Thresholds come from `ISSUE_RATE_LIMIT_MAX` / `ISSUE_RATE_LIMIT_WINDOW_SECONDS`. Like `SAFE_BROWSING_API_KEY`, these and `RATE_LIMIT_SECRET` must be set for every environment that runs `next start` (on Vercel, Preview as well as Production), or the server refuses to start.

The client is identified by `x-real-ip`, else the first `x-forwarded-for` entry (IPv6 grouped by /64), stored only as an HMAC with `RATE_LIMIT_SECRET`, never as a raw address. This relies on the proxy in front overwriting those headers, as Vercel's edge does; a self-hosted deployment must put a reverse proxy in front that overwrites `X-Forwarded-For` / `X-Real-IP`.

Links expire one year after they are issued.

### Security headers

Every response (pages, the short-link `302`, the `404` pages, the API) gets a static Content-Security-Policy plus `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY`, a minimal `Permissions-Policy`, and `Strict-Transport-Security` in production (`apps/web/lib/http/security-headers.ts`, applied in `next.config.ts`). The CSP allows only this origin; scripts need `'unsafe-inline'` because a nonce-based CSP would force every page to render dynamically, giving up the prerendered shells. Anything that loads from another origin (analytics, embeds, a CDN font) must be added to the policy.

---

## Phrase Patterns

| Pattern | Example |
|---------|---------|
| `[adj]-[noun]-[verb]-to-[adj]-[noun]` | `golden-clock-whispers-to-silent-butterfly` |
| `[noun]-of-[adj]-[noun]-[verb]` | `river-of-broken-mirror-melts` |
| `[adj]-[noun]-[verb]-with-[adj]-[noun]` | `silent-cat-dances-with-lost-moon` |
| `[verb]-[adj]-[noun]-into-[noun]` | `fold-ancient-light-into-clock` |
| `[adj]-[noun]-[adv]-[verb]` | `hollow-tree-slowly-remembers` |
| `[noun]-[adv]-[verb]-[adj]-[noun]` | `smoke-gently-carries-blue-key` |

---

## Project Structure

```
oddlink/
├── scripts/                          bootstrap.mjs / stop.mjs / verify.mjs (plain Node, no dependencies)
├── apps/
│   └── web/                          Next.js app
│       ├── proxy.ts                  short-link redirects, `+` previews and the analytics 404 check (runs before routing)
│       ├── app/                      routes only: home, analytics, preview, not-found, api/issue
│       ├── lib/
│       │   ├── middleware/           redirect / preview / analytics handling used by proxy.ts
│       │   ├── links/                issuing, resolving and counting links
│       │   ├── rate-limit/           per-client rate limit (Postgres counter, HMAC client keys)
│       │   ├── analytics/            analytics queries
│       │   ├── actions/              Server Actions
│       │   ├── zod/schemas/          request validation
│       │   └── db/                   Drizzle schema and client
│       ├── ui/                       app-specific components, by feature
│       ├── drizzle/                  SQL migrations (schema + seed words)
│       ├── scripts/                  operator CLI (link:disable / link:enable / link:delete, run with tsx)
│       └── tests/                    integration tests, by feature
└── packages/
    ├── ui/                           @oddlink/ui: ErrorMessage, useCopy, charts
    ├── utils/                        @oddlink/utils: phrase generator (no framework or DB)
    ├── tailwind-config/              @oddlink/tailwind-config: shared theme.css
    └── tsconfig/                     @oddlink/tsconfig: shared TypeScript configs
```

Workspace packages are consumed as TypeScript source (`transpilePackages` in `apps/web/next.config.ts`), so they need no build step.

---

## Scripts

Run from the repository root; Turborepo runs each task in every package that defines it.

| Command | |
|---|---|
| `pnpm bootstrap` | Start: one-command local setup (see [Getting Started](#getting-started)); `--no-dev` skips starting the dev server |
| `pnpm stop` | Stop: the dev server started by `pnpm bootstrap`, then the `oddlink-db` container (data kept); `--keep-db` leaves the database running |
| `pnpm verify` | Run the CI checks locally: lint, typecheck, build (without `DATABASE_URL`), test. Needs Postgres running |
| `pnpm dev` / `build` / `start` | Next.js dev server / production build / production server |
| `pnpm lint` / `typecheck` | Lint / type check |
| `pnpm test` | Run tests (needs `db:up`; creates `oddlink_test` automatically) |
| `pnpm test:scripts` | Test `scripts/stop.mjs` (uses a throwaway container; the Docker tests are skipped if Docker is not running) |
| `pnpm db:up` / `db:down` | Create and start Postgres / remove the container (the data volume is kept) |
| `pnpm db:generate` | Generate a migration after changing `apps/web/lib/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |
| `pnpm --filter web link:disable` / `link:enable` / `link:delete` `<code>` | Operator commands (see [Operator commands](#operator-commands)) |

CI (GitHub Actions) runs lint, typecheck, build and test on every pull request and push to `main`.

### Operator commands

Take a short link out of service, put it back, or delete it, acting as the operator (the highest-ranked actor: it can clear any disable, and no one else can undo its disable). There is no admin web page; these run against the database directly.

```bash
pnpm --filter web link:disable <code>         # stop redirecting
pnpm --filter web link:enable <code>          # undo a disable (any actor's)
pnpm --filter web link:delete <code>          # irreversible: asks you to type the code to confirm
pnpm --filter web link:delete --yes <code>    # skip the prompt (required when not in a terminal)
```

`<code>` is a short code (`golden-clock-whispers`) or a pasted short link (`http://localhost:3000/golden-clock-whispers`, its `+` preview link, or its `/analytics/…` or `/preview/…` page); any other path is rejected, and the host is not checked, so a pasted production link still acts on whichever database `DATABASE_URL` points to. Delete keeps the row as a tombstone so the phrase is never issued again, clears its URL and count, and removes its access logs; it cannot be undone. Without a terminal and without `--yes`, delete refuses.

Each run prints one line (`disabled: <code>`, `already disabled: <code>`, `not found: <code>`, …) and never the destination URL or connection details. Exit codes: `0` done or already in that state, `1` not found / deleted / not allowed / confirmation mismatch / database error, `2` usage error (including a refused delete or a missing `DATABASE_URL`). `pnpm --filter` reports every failure as `1`; a script that needs the exact code can run `pnpm -C apps/web link:disable <code>` instead.

The commands read `DATABASE_URL` from `apps/web/.env`, like `pnpm db:migrate`; a value set in the shell takes precedence. To act on production, pass its URL for that one command, without writing it into your shell history:

```bash
read -rs DATABASE_URL && export DATABASE_URL   # paste the URL; nothing is echoed
pnpm --filter web link:disable <code>
unset DATABASE_URL
```

These commands use the app's connection code, so for a TLS database also export `DATABASE_CA_CERT` (for example `export DATABASE_CA_CERT="$(cat ca.pem)"`); without it they refuse a database on another machine, and a URL with `sslmode` is rejected.

`DATABASE_URL=postgres://… pnpm --filter web link:disable <code>` also works, but leaves the credentials in your shell history unless your shell skips commands that start with a space (zsh `setopt HIST_IGNORE_SPACE`, bash `HISTCONTROL=ignorespace`) and you prefix one. Never put production credentials in `apps/web/.env` of a working copy.

---

## Environment Variables

Set in `apps/web/.env`, or in the shell (`turbo.json` passes these through to the tasks).

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | — | In production | Postgres connection string (`postgres://` or `postgresql://`). In production it must not point to this machine (see below). TLS query parameters (`sslmode`, `ssl`, `sslrootcert`, …) are rejected: TLS is set by `DATABASE_CA_CERT` |
| `DATABASE_CA_CERT` | — | In production, and whenever `DATABASE_URL` is not on this machine | CA certificate the database server must chain to, as PEM text (newlines, or literal `\n` on one line) or that PEM base64-encoded. When set, the app connects over TLS and verifies the certificate and host name; when unset, it connects without TLS, which is only accepted for a database on this machine (see [Database connection](#database-connection)) |
| `ALLOW_LOCAL_PRODUCTION` | — | No | `1` lets a production process on this machine use local URLs (see below) and, with a local `DATABASE_URL`, run without `DATABASE_CA_CERT`. An error on Vercel |
| `BASE_URL` | `http://localhost:3000` | In production | Absolute `http`/`https` URL used in generated short links; no credentials, query or fragment; trailing slashes are removed. In production it must be `https` and must not point to this machine (see below) |
| `SAFE_BROWSING_API_KEY` | — | In production | Google Safe Browsing API key used to refuse phishing/malware URLs when issuing. Without it (dev, tests) the check is skipped with one warning |
| `RATE_LIMIT_SECRET` | dev-only value | In production | Secret (32+ characters, e.g. `openssl rand -hex 32`) used to HMAC client addresses for rate limiting |
| `ISSUE_RATE_LIMIT_MAX` | dev-only value | In production | Links one client may issue per window (positive integer) |
| `ISSUE_RATE_LIMIT_WINDOW_SECONDS` | dev-only value | In production | Rate-limit window length in seconds (positive integer) |
| `ALLOW_LOCAL_PRODUCTION` | — | No | `1` lets a production build run on your machine with local `BASE_URL` / `DATABASE_URL` (see below). An error on Vercel; never set it in a deploy environment |
| `APP_TIME_ZONE` | `Asia/Tokyo` | No | IANA time zone name (e.g. `Asia/Tokyo`, `UTC`) for daily click counts and dates; offsets like `+09:00` are rejected |
| `TEST_DATABASE_URL` | — | For `pnpm test` | Database used by the tests (not read by the app) |
| `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | `oddlink` / `postgres` / `postgres` | No | Used by `apps/web/docker-compose.yml` |

The app validates these at startup (`apps/web/lib/env.ts`). In production (`next start`), a missing `BASE_URL`, `DATABASE_URL`, `DATABASE_CA_CERT`, `SAFE_BROWSING_API_KEY`, `RATE_LIMIT_SECRET`, `ISSUE_RATE_LIMIT_MAX` or `ISSUE_RATE_LIMIT_WINDOW_SECONDS`, or any malformed value, prints every problem and exits. In development and tests, missing values fall back to the defaults. `next build` needs none of them.

Production also refuses local URLs, so values copied from `.env.example` into a deploy environment fail at startup instead of issuing `localhost` short links: `BASE_URL` must use `https`, and neither `BASE_URL` nor `DATABASE_URL` may point to this machine (`localhost`, `*.localhost`, `127.0.0.0/8`, `0.0.0.0`, `::1`, `::`, or for the database an empty host or a Unix socket). To try a production build locally, opt in explicitly:

```bash
pnpm build
ALLOW_LOCAL_PRODUCTION=1 pnpm start      # or uncomment it in apps/web/.env
```

`ALLOW_LOCAL_PRODUCTION=1` lifts only these local-URL rules, and with a local `DATABASE_URL` the `DATABASE_CA_CERT` requirement; everything else (the required variables, URL shapes) is still checked. Only the exact value `1` is accepted, and when Vercel's system variables (`VERCEL`, `VERCEL_ENV`) are present it is itself an error, at build and at startup, so it cannot switch the rules off in a Vercel deployment.

### Database connection

The pool (`apps/web/lib/db/index.ts`) is sized for serverless functions, where every instance holds its own pool: at most 5 connections, idle ones closed after 5 seconds, and `attachDatabasePool` from `@vercel/functions` keeps a Vercel function alive until released connections pass that idle timeout, so they are closed rather than left open while the instance is suspended. Off Vercel it does not wait for anything.

**TLS.** With `DATABASE_CA_CERT` set, the connection uses TLS with `rejectUnauthorized: true` and Node's host-name check, the equivalent of libpq `sslmode=verify-full`; verification is never turned off. Without it, the connection is plain TCP, which is what the local Docker Postgres expects; a `DATABASE_URL` pointing to another machine is refused in every mode (dev servers and operator commands included), so the password never crosses the network in plain text. Production refuses to start without `DATABASE_CA_CERT` unless `DATABASE_URL` points to this machine and `ALLOW_LOCAL_PRODUCTION=1` is set (an error on Vercel).

`DATABASE_URL` must not carry TLS query parameters. node-postgres parses the connection string and lets it override the `ssl` option, so `?sslmode=require` would drop the CA, `?sslmode=disable` would turn TLS off and `?sslmode=no-verify` would turn verification off; rejecting them keeps `DATABASE_CA_CERT` the only switch. `PGSSLMODE` in the environment is ignored for the same reason.

For Supabase, download the CA from the project's Database Settings (SSL Configuration) and set it on Vercel for Production and Preview. A multi-line value can be pasted as is; if a setting only takes one line, use `base64 < prod-ca-2021.crt | tr -d '\n'` (the filename is whatever the dashboard gives you). Consider turning on Supabase's SSL enforcement too, so the server refuses plaintext clients as well.

`pnpm db:migrate` (drizzle-kit) and its own `DATABASE_URL` do not read `DATABASE_CA_CERT`. To migrate a TLS database, give that one command a URL with `?sslmode=verify-full&sslrootcert=/path/to/ca.pem`.

**Statement timeout.** The pool sends `statement_timeout=5000` as a startup parameter. That works on a direct connection and on Supavisor in session mode (port 5432), but Supabase documents that session-level settings cannot be used through Supavisor in transaction mode (port 6543), which is the URL to use on Vercel. Whether Supavisor applies the startup parameter there is Unverified, so set the timeout on the database role as well, once, from the SQL editor:

```sql
ALTER ROLE <app_role> SET statement_timeout = '5s';
```

`<app_role>` is the Postgres role the app connects as (with the shared pooler, the user `postgres.<project-ref>` is the role `postgres`). Postgres applies a role setting when a server session starts, so it does not depend on the pooler; server connections the pooler already holds keep the old value until they are replaced. The setting affects every session of that role, including `pnpm db:migrate` and the dashboard's SQL editor when they use the same role, so a dedicated role for the app is preferable to changing `postgres`. Check it with `SELECT rolname, rolconfig FROM pg_roles WHERE rolname = '<app_role>';` (`SHOW statement_timeout` in an existing session does not reflect it).
