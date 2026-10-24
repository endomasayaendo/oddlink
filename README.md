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

> This is a rewrite of the original Spring Boot + Vite version ([oddlink-spring](https://github.com/endomasayaendo/oddlink-spring)) as a single Next.js app.

---

## Tech Stack

| | |
|---|---|
| **App** | Next.js 16 (App Router) · React 19 · TypeScript |
| **Data** | PostgreSQL 17 (Docker) · Drizzle ORM · drizzle-kit migrations |
| **UI** | Tailwind CSS 4 · Recharts |
| **Validation / Tests** | Zod · Vitest (against a real Postgres test database) |

---

## Getting Started

**Prerequisites:** Node.js 20.12+, Docker

```bash
git clone https://github.com/endomasayaendo/oddlink.git
cd oddlink
npm install
cp .env.example .env    # defaults work out of the box
npm run db:up           # start Postgres
npm run db:migrate      # create tables and seed words
npm run dev             # http://localhost:3000
```

---

## Routes

| Route | What it does |
|---|---|
| `/` | Shorten a URL (Server Action) and see your recent links (stored in `localStorage`) |
| `POST /api/issue` | Shorten a URL from anywhere else (see below) |
| `GET /{shortCode}` | `302` to the original URL; counts the access and logs it after responding. Unknown or expired codes go to `/not-found` |
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
src/
├── app/
│   ├── page.tsx                      home
│   ├── actions.ts                    Server Action for issuing
│   ├── api/issue/route.ts            JSON API for issuing
│   ├── [shortCode]/route.ts          redirect
│   ├── analytics/[shortCode]/        analytics page
│   └── not-found/                    "link doesn't exist or has expired"
├── components/                       UI components
├── hooks/                            useHistory, useCopy
├── db/                               Drizzle schema and client
└── lib/                              phrase generation, issuing, redirect, analytics
drizzle/                              SQL migrations (schema + seed words)
tests/                                unit and integration tests
```

---

## Scripts

| Command | |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run db:up` / `db:down` | Start / stop Postgres |
| `npm run db:generate` | Generate a migration after changing `src/db/schema.ts` |
| `npm run db:migrate` | Apply migrations |
| `npm test` | Run tests (needs `db:up`; creates `oddlink_test` automatically) |
| `npm run typecheck` / `lint` | Type check / lint |

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | Postgres connection string |
| `TEST_DATABASE_URL` | — | Database used by `npm test` |
| `BASE_URL` | `http://localhost:3000` | Base URL used in generated short links |
| `APP_TIME_ZONE` | `Asia/Tokyo` | Time zone for daily click counts and dates |
| `DB_NAME` / `DB_USERNAME` / `DB_PASSWORD` | `oddlink` / `postgres` / `postgres` | Used by `docker-compose.yml` |
