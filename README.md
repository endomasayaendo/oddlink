<div align="center">

<pre>
  ####    #####   #####   #        ###   #    #  #    #
 #    #   #    #  #    #  #         #    ##   #  #   #
#      #  #     # #     # #         #    # #  #  ####
#      #  #     # #     # #         #    #  # #  #  #
 #    #   #    #  #    #  #         #    #   ##  #   #
  ####    #####   #####   ######   ###   #    #  #    #
</pre>

**Where links get odd.**

A URL shortener that generates surreal English phrases as short codes.

`https://example.com/very/long/boring/url`  →  `localhost:8080/golden-clock-whispers-to-silent-butterfly`

![Java](https://img.shields.io/badge/Java-21-orange?style=flat-square&logo=openjdk)
![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.5.9-6DB33F?style=flat-square&logo=springboot)
![React](https://img.shields.io/badge/React-19.2-61DAFB?style=flat-square&logo=react)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-4169E1?style=flat-square&logo=postgresql)
![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)

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

6 phrase patterns. ~185 seed words. Endless oddness.

---

## Tech Stack

| | |
|---|---|
| **Backend** | Spring Boot 3.5.9 · Java 21 · Spring Data JPA · Flyway |
| **Frontend** | React 19.2 · TypeScript · Vite · React Router 7 · Recharts |
| **Database** | PostgreSQL 17 (Docker) |

---

## Getting Started

**Prerequisites:** Java 21, Node.js 18+, Docker

### 1. Clone and configure

```bash
git clone https://github.com/endomasayaendo/oddlink.git
cd oddlink
cp .env.example .env
```

The defaults in `.env` work out of the box for local development.

### 2. Start the database

```bash
docker compose up -d
```

### 3. Start the backend

```bash
./mvnw spring-boot:run
```

> Runs on `http://localhost:8080`. Flyway runs migrations automatically on startup.

### 4. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

> Runs on `http://localhost:3000`. API calls are proxied to the backend automatically.

---

## API

### `POST /api/issue` — Shorten a URL

```bash
curl -X POST http://localhost:8080/api/issue \
  -H "Content-Type: application/json" \
  -d '{"originalUrl": "https://example.com/some/long/url"}'
```

```json
{
  "shortUrl": "http://localhost:8080/golden-clock-whispers-to-silent-butterfly",
  "originalUrl": "https://example.com/some/long/url"
}
```

### `GET /{shortCode}` — Redirect

Redirects to the original URL and logs the access.

### `GET /api/analytics/{shortCode}` — Analytics

```json
{
  "shortCode": "golden-clock-whispers-to-silent-butterfly",
  "shortUrl": "http://localhost:8080/golden-clock-whispers-to-silent-butterfly",
  "originalUrl": "https://example.com/some/long/url",
  "totalAccessCount": 42,
  "createdAt": "2025-01-01T00:00:00",
  "expiresAt": "2025-04-01T00:00:00",
  "dailyAccess": [
    { "date": "2025-01-01", "count": 10 },
    { "date": "2025-01-02", "count": 32 }
  ]
}
```

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

## Running Tests

```bash
./mvnw test
```

Uses H2 in-memory database and MockMvc. No external services required.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_NAME` | `oddlink` | PostgreSQL database name |
| `DB_USERNAME` | `postgres` | PostgreSQL username |
| `DB_PASSWORD` | `postgres` | PostgreSQL password |
| `BASE_URL` | `http://localhost:8080` | Base URL used in generated short links |
| `FRONTEND_URL` | `http://localhost:3000` | Frontend origin |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:3000` | Allowed CORS origins |
