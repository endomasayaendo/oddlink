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

**Prerequisites:** Node.js 22.12+ (`.nvmrc` pins 26 — run `nvm use`), pnpm 12 (`npm i -g pnpm`), Docker

```bash
git clone https://github.com/endomasayaendo/oddlink.git
cd oddlink
pnpm install
cp apps/web/.env.example apps/web/.env   # defaults work out of the box
pnpm db:up                               # start Postgres
pnpm db:migrate                          # create tables and seed words
pnpm dev                                 # http://localhost:3000
```

---

## Routes

| Route | What it does |
|---|---|
| `/` | Shorten a URL (Server Action) and see your recent links (stored in `localStorage`) |
| `POST /api/issue` | Shorten a URL from anywhere else (see below) |
| `GET /{shortCode}` | Handled in `proxy.ts`: counts and logs the access in one SQL statement, then `302`s to the original URL (`503` if that write fails). Unknown or expired codes get a real `404` |
| `GET /{shortCode}+` | Preview page (rewritten to `/preview/{shortCode}`): shows the destination host and full address, created / expires dates and total clicks, and a "Continue" button that goes through the short link itself. Viewing it never counts as a click. Unknown, unusable or malformed codes get a real `404`; expired links get a page with an "Expired" banner and no button. `no-store`, `noindex`. A transparency feature for the person holding the link, not an abuse filter |
| `/analytics/{shortCode}` | Total clicks, created / expires dates, and daily clicks. `proxy.ts` checks the code first so unknown codes get a real `404` |

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

Errors return `{"message": "..."}`: `400` for a blank or invalid URL (only `http`/`https` are accepted), `422` if Google Safe Browsing flags the URL (the body also carries `"advisory": "Advisory provided by Google"` and `"advisoryUrl"`), `503` if no unique phrase could be generated.

### Safe Browsing check

Before issuing, the destination is looked up in [Google Safe Browsing v5](https://developers.google.com/safe-browsing/reference) in [No-Storage Real-Time mode](https://developers.google.com/safe-browsing/reference/No.Storage.Real.Time.Mode): only 4-byte SHA-256 hash prefixes of the URL's host/path expressions are sent, never the URL itself (`apps/web/lib/links/safe-browsing/`). Matches for malware, social engineering, unwanted software and potentially harmful applications are refused. Answers are cached in memory per prefix (at most 30 minutes). If Google is slow (> 1 s), down, rate-limits us, or no key is set, the link is issued anyway (fail open).

Setting up the key: create an API key in the Google Cloud console with the Safe Browsing API enabled, **restrict the key to the Safe Browsing API**, and set `SAFE_BROWSING_API_KEY` for every environment that runs `next start` — on Vercel that includes Preview deployments, not just Production. The Safe Browsing API is for non-commercial use; a commercial OddLink would move to Web Risk.

Links expire one year after they are issued.

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
├── apps/
│   └── web/                          Next.js app
│       ├── proxy.ts                  short-link redirects, `+` previews and the analytics 404 check (runs before routing)
│       ├── app/                      routes only: home, analytics, preview, not-found, api/issue
│       ├── lib/
│       │   ├── middleware/           redirect / preview / analytics handling used by proxy.ts
│       │   ├── links/                issuing, resolving and counting links
│       │   ├── analytics/            analytics queries
│       │   ├── actions/              Server Actions
│       │   ├── zod/schemas/          request validation
│       │   └── db/                   Drizzle schema and client
│       ├── ui/                       app-specific components, by feature
│       ├── drizzle/                  SQL migrations (schema + seed words)
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
| `pnpm dev` / `build` / `start` | Next.js dev server / production build / production server |
| `pnpm lint` / `typecheck` | Lint / type check |
| `pnpm test` | Run tests (needs `db:up`; creates `oddlink_test` automatically) |
| `pnpm db:up` / `db:down` | Start / stop Postgres |
| `pnpm db:generate` | Generate a migration after changing `apps/web/lib/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |

CI (GitHub Actions) runs lint, typecheck, build and test on every pull request and push to `main`.

---

## Environment Variables

Set in `apps/web/.env`, or in the shell (`turbo.json` passes these through to the tasks).

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DATABASE_URL` | — | In production | Postgres connection string (`postgres://` or `postgresql://`) |
| `BASE_URL` | `http://localhost:3000` | In production | Absolute `http`/`https` URL used in generated short links; no credentials, query or fragment; trailing slashes are removed |
| `SAFE_BROWSING_API_KEY` | — | In production | Google Safe Browsing API key used to refuse phishing/malware URLs when issuing. Without it (dev, tests) the check is skipped with one warning |
| `APP_TIME_ZONE` | `Asia/Tokyo` | No | IANA time zone name (e.g. `Asia/Tokyo`, `UTC`) for daily click counts and dates; offsets like `+09:00` are rejected |
| `TEST_DATABASE_URL` | — | For `pnpm test` | Database used by the tests (not read by the app) |
| `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | `oddlink` / `postgres` / `postgres` | No | Used by `apps/web/docker-compose.yml` |

The app validates these at startup (`apps/web/lib/env.ts`). In production (`next start`), a missing `BASE_URL`, `DATABASE_URL` or `SAFE_BROWSING_API_KEY`, or any malformed value, prints every problem and exits. In development and tests, missing values fall back to the defaults. `next build` needs none of them.
