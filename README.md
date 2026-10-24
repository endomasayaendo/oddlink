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

**Prerequisites:** Node.js 20.12+, pnpm 12 (`npm i -g pnpm`), Docker

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
| `GET /{shortCode}` | Handled in `proxy.ts`: `302` to the original URL; counts the access and logs it after responding. Unknown or expired codes go to `/not-found` |
| `/analytics/{shortCode}` | Total clicks, created / expires dates, and daily clicks |

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

Errors return `{"message": "..."}`: `400` for a blank or invalid URL (only `http`/`https` are accepted), `503` if no unique phrase could be generated.

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
│       ├── proxy.ts                  short-link redirects (runs before routing)
│       ├── app/                      routes only: home, analytics, not-found, api/issue
│       ├── lib/
│       │   ├── middleware/           redirect handling used by proxy.ts
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
| `pnpm dev` / `build` | Next.js dev server / production build |
| `pnpm lint` / `typecheck` | Lint / type check |
| `pnpm test` | Run tests (needs `db:up`; creates `oddlink_test` automatically) |
| `pnpm db:up` / `db:down` | Start / stop Postgres |
| `pnpm db:generate` | Generate a migration after changing `apps/web/lib/db/schema.ts` |
| `pnpm db:migrate` | Apply migrations |

---

## Environment Variables

Set in `apps/web/.env`.

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Postgres connection string |
| `TEST_DATABASE_URL` | — | Database used by `pnpm test` |
| `BASE_URL` | `http://localhost:3000` | Base URL used in generated short links |
| `APP_TIME_ZONE` | `Asia/Tokyo` | Time zone for daily click counts and dates |
| `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | `oddlink` / `postgres` / `postgres` | Used by `apps/web/docker-compose.yml` |
