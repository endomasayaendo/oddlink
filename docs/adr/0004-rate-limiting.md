# 0004. Rate limiting for link issuance

- Status: Accepted (2026-11-14, by the owner)
- Date: 2026-11-14
- Related: #33 (rate limiting), ADR 0001 (deploy target: Vercel + Supabase), #35 (data retention)

## Context

Anyone can issue short links without an account, through the form on `/` (a Server Action) and `POST /api/issue`. Without a limit, one client can create links in bulk for spam or phishing and fill the database. Safe Browsing (#50) catches known-bad destinations but not volume. The budget is a hobby one, so the limit must not need a new paid service.

## Requirements

**must**
- M1. Limit how many links one client can issue in a period, for both the form and the API, with one shared budget.
- M2. Thresholds come from the environment, not the repository (the repository is public).
- M3. Never store or log raw client addresses.
- M4. No new paid service.

**should**
- S1. Correct under concurrent requests and across several app instances (serverless).
- S2. A failure of the limiter must not take link issuing down.

## Options

- **A. Vercel WAF only.** No code. Keyed by IP at the edge, configured in the dashboard. Applies only on Vercel, cannot see whether the input was valid, and on Hobby the number of rate-limit rules is small (ADR 0001 found one; current limits **Unverified**, not re-checked on 2026-11-14).
- **B. In-memory counter in the app.** Simple, but each serverless instance has its own memory, so it does not meet S1.
- **C. Counter in Postgres (the existing DB).** One atomic upsert per issue. Works on any host, shares state across instances, costs one extra query per issue. No new service (M4).
- **D. Redis / Upstash.** Purpose-built, but a new service and account (M4).

## Decision

**A + C, layered.**

- **Vercel WAF** is the coarse front layer: a rate-limit rule on `POST /api/issue` and on Server Action POSTs to `/` (requests with a `Next-Action` header), keyed by IP. Its thresholds live only in the Vercel dashboard.
- **The app limiter (C)** is the final check, in `issueShortUrl` (`apps/web/lib/links/issue-link.ts`), so the form and the API share one budget. It runs after URL validation (invalid input is not counted) and before the Safe Browsing lookup (unsafe submissions are counted, and a limited client never costs a Safe Browsing call).
  - Fixed window, aligned to the epoch using the database clock, one row per (scope, client key) in `rate_limits`, updated by a single `INSERT … ON CONFLICT DO UPDATE` so concurrent requests serialize on the row (S1).
  - Client key: `x-real-ip`, else the first `x-forwarded-for` entry, normalized (IPv4-mapped IPv6 → IPv4, IPv6 → its /64), then HMAC-SHA256 with `RATE_LIMIT_SECRET` (M3). Requests with no usable address share one bucket.
  - Rejected requests get `429` with `Retry-After` (API) or a friendly message (form).
  - On a database error the limiter **fails open** and logs an error code only (S2).
  - `RATE_LIMIT_SECRET`, `ISSUE_RATE_LIMIT_MAX` and `ISSUE_RATE_LIMIT_WINDOW_SECONDS` are **required in production**; the server refuses to start without them (M2). Dev and tests use dev-only defaults.
- **No global (all-clients) limit** for now (YAGNI). Add a second scope if distributed abuse appears.

Runner-up: D, if the extra query per issue ever matters or limits are needed on hot paths such as redirects.

## Consequences

- New table `rate_limits` (migration `0003_rate_limits`). Rows are small, one per active client. Purging old rows by `window_start` belongs with the retention work in #35.
- Three new environment variables (README, `.env.example`, `turbo.json`).
- **Trusting `x-real-ip` / `x-forwarded-for` is only safe behind a proxy that overwrites them.** Vercel's edge is assumed to (to be confirmed on a Preview deployment). A self-hosted deployment must put a reverse proxy in front that overwrites `X-Forwarded-For` / `X-Real-IP`; otherwise clients can choose their own bucket.

## Open questions / risks

- That Vercel overwrites `x-real-ip` and `x-forwarded-for` with the real client address is **Unverified**; check real values on a Preview deployment before relying on it.
- Vercel WAF rule limits on Hobby are **Unverified** as of 2026-11-14.
- Clients behind one NAT or carrier-grade NAT share a bucket; clients without a usable address share one bucket. Both may be limited earlier than intended.
- A fixed window allows up to twice the limit across a window boundary. Acceptable for this purpose.
