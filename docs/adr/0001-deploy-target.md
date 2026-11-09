# 0001. Deploy target (hosting and Postgres)

- Status: Proposed (the owner decides; this document goes only as far as a recommendation)
- Date: 2026-11-10
- Related: #28 (Pool settings), #29 (env var validation at startup), #33 (rate limiting, needs-decision), #35 (data retention)

## Context

OddLink is a free URL shortener run on a hobby budget (free to a few dollars a month). As a product it needs the following.

- **Fast redirects.** Users are mainly in Japan. People who click a short URL do not expect to wait, so we want the single round trip of `GET /{shortCode}` (`proxy.ts` → `lib/middleware/link.ts`, which runs UPDATE+INSERT in one statement) to complete close to Japan. The distance between the app and the DB is added to every request.
- **A write on every request.** The click count and the access log are written in the same SQL statement, so a cache cannot keep requests away from the DB. Read-only CDN caching does not help.
- **Resilience against abuse.** Public short URLs are easily used for mass creation and spam. If the platform can do rate limiting or blocking, less has to be built into the app (#33).
- **Scheduled jobs.** Deleting expired links and logs (#35) needs a scheduler. Once a day should be enough.
- **Future features.** Optional login (OAuth) may be added. We do not decide that here, but we do not want to rule it out.
- **Low operational effort.** One person runs this, so the less OS patching and backup work we own, the better.

## Requirements

**must**
- M1. Can run at the current scale on a free tier or around $5/month.
- M2. App and Postgres can be placed in Japan (Tokyo) or in the same region.
- M3. Can run the current Node.js runtime `proxy.ts` + `pg` as is (no rewrite).
- M4. Can connect to the DB over TLS with certificate verification (equivalent to `sslmode=verify-full`). `rejectUnauthorized: false` is not used.
- M5. Can run scheduled jobs at least once a day (#35).

**should**
- S1. The platform offers rate limiting / a WAF (#33).
- S2. Cost stays predictable at 10x traffic (no sudden charges).
- S3. Moving to another option requires little rewriting.
- S4. OAuth is easy to add.

## Options

All sources were checked on 2026-11-10. See "Sources" at the end for the numbers.

### A. Vercel Hobby (function region `hnd1`, Tokyo) + Supabase Free (Tokyo, `ap-northeast-1`)

Verified facts
- Vercel Hobby guideline limits: 1M Function Invocations/month, 100 GB Fast Data Transfer, 4 hours of Active CPU [1]. Hobby is for **non-commercial personal use only** (showing ads or paid contract work counts as commercial; soliciting donations does not) [1].
- Even on Hobby, one function region can be chosen, and `hnd1` (Tokyo) is available. The default is `iad1`, so it must be set explicitly [2][3].
- Vercel Routing Middleware uses the Node.js runtime by default and runs on fluid compute [4]. However, the docs say "Routing Middleware is deployed to all regions regardless of the region setting, and on Hobby it runs in fewer regions" [2]. In which region Next.js `proxy.ts` actually runs is **Unverified** (see below).
- Cron on Hobby: at most once a day, with the run time anywhere within ±59 minutes [5].
- WAF rate limiting: one rule is available even on Hobby [6].
- For the `pg` Pool, `attachDatabasePool` (from `@vercel/functions`) can close idle connections before the function is suspended. Recommended: a Pool in global scope, a short idle timeout, and avoid `max: 1` [7][8].
- Supabase Free: 500 MB DB per project, 5 GB egress, 2 active projects, and **paused after 1 week of inactivity**. Pro starts at $25/month [9]. A Tokyo region exists [10].
- Supabase's shared pooler (Supavisor) uses port 6543 for transaction mode and 5432 for session mode, both over IPv4. Transaction mode is meant for serverless: prepared statements are not supported, and session state such as `SET` is lost across transactions. Direct connections are IPv6 by default [11].
- `sslmode=verify-full` is recommended for TLS, and the CA certificate is obtained from the dashboard [12].

What it gives us: preview and production deploys on Git push, app and DB aligned in Tokyo, and WAF, daily Cron and `after()` together. Supabase Auth is also available (S4).
What it rules out: going commercial (ads, etc.) requires Vercel Pro. Cron on Hobby is daily at most.
Cost: $0 now. At 10x traffic, assuming 1 redirect ≈ 1 invocation, 1M per month (about 33,000 per day) is the upper end of the Hobby guideline. Beyond that, Vercel Pro (pricing not checked this time). The DB may hit 500 MB depending on how fast logs grow, which is where the #35 retention period matters. Beyond that, Supabase Pro at $25/month.

Changes needed in this repository
- Set the Vercel project's Root Directory to `apps/web` and the Function Region to `hnd1` (via `regions` in `apps/web/vercel.json` or the dashboard).
- `apps/web/lib/db/index.ts`: smaller `max`, shorter `idleTimeoutMillis`, and add `attachDatabasePool(pool)`.
- `statement_timeout` (#28): whether transaction-mode Supavisor accepts startup parameters is **Unverified**. In case it does not, the first candidate is to move to a role-level `ALTER ROLE ... SET statement_timeout` (a DB-side setting, so it does not depend on the pooler).
- TLS: pass Supabase's CA through an environment variable (e.g. `DATABASE_CA_CERT`) and verify with `ssl: { ca }`. Check at implementation time how the `sslmode` in the connection string interacts with the `ssl` option.
- `apps/web/lib/env.ts`: validate the new environment variables. Preview deployments are expected to have `NODE_ENV=production` too, so either prepare a preview `BASE_URL` / `DATABASE_URL` or handle previews differently.

Lock-in: small. The app is plain Next.js; the only Vercel-specific parts are `vercel.json` and `attachDatabasePool`. The DB is plain Postgres and can be moved with `pg_dump`.

### B. Vercel Hobby + Neon Free

- Neon has **no Tokyo region**. In Asia there are only Singapore (`aws-ap-southeast-1`) and Sydney [13].
- Free: 1 GB, 100 CU-hours/month, **scale to zero after 5 minutes of inactivity (cannot be disabled)** [14].
- Putting the function in `sin1` keeps app↔DB close but puts the function far from users in Japan. Putting it in `hnd1` makes every query cross Tokyo↔Singapore. Either way it is slower than A (concrete ms is **Unverified**). The first-request delay after scale-to-zero lands directly on the redirect (seconds **Unverified**).
- Cost: $0 now. The pay-as-you-go Launch plan is $0.106/CU-hour + $0.35/GB-month [14].
- Changes are almost the same as A (through the pooler, `statement_timeout` has the same problem).
- Lock-in: small. It does not satisfy M2, so it is not even the runner-up.

### C. Cloudflare Workers (OpenNext) + Postgres (via Hyperdrive)

- OpenNext's Cloudflare adapter supports Next.js 16, but **Node Middleware is not supported** [15]. The current `proxy.ts` uses `pg` directly on the Node.js runtime, so it does not run as is.
- Workers Free: 100,000 requests/day, 10 ms CPU per invocation. Paid starts at $5/month. Hyperdrive Free: 100,000 queries/day [16].
- What it gives us: processing right at the CDN, and Cloudflare's WAF is available.
- What it rules out: M3. The redirect would have to be rewritten onto a non-Node.js path (Edge runtime, or moved to a route handler), and the startup validation and Pool assumptions settled in #28/#29 would have to be rebuilt.
- Cost: the free tier is per day, so at 10x traffic redirects plus log writes are likely to hit the daily cap, and Paid at $5/month looks like a prerequisite.
- Lock-in: medium. We would have to keep following the adapter's support status.

### D. Small always-on VM/container (Tokyo) + Postgres

Example candidates:
- Fly.io: no free tier for new organizations (only a 7-day / $1 trial credit). shared-cpu-1x 256 MB is $2.19/month (the price in US regions; the price in Tokyo `nrt` is **Unverified**). Managed Postgres starts at $38/month [17]. `nrt` is a region that supports Managed Postgres [18].
- Oracle Cloud Always Free: Arm 2 OCPU / 12 GB usable indefinitely, but limited to the home region, and the instance **may be reclaimed** if CPU, network and other utilization stays low for 7 days [19]. Whether Tokyo can be the home region, and whether capacity is available, is **Unverified**.

What it gives us: the current code runs almost as is (`next start`, Node.js `proxy.ts`, `max: 10`, `statement_timeout`, failure detection via `process.exit(1)` → restart policy). `after()` also works [20]. Cron is whatever the OS offers.
What it rules out: managed WAF, automatic TLS and preview deployments. Rate limiting has to be done by ourselves in a reverse proxy or the app (Next.js also recommends putting a reverse proxy in front [20]). We own OS updates, backups and monitoring.
Cost: a few dollars a month with Fly + self-hosted Postgres on the VM. Using Fly's Managed Postgres costs around $40/month, which is over budget. A setup that uses Supabase Tokyo for the DB, as in A, is also possible. At 10x traffic we just increase the VM size, so cost is easy to predict.
Changes needed in this repository: `output: "standalone"` in `apps/web/next.config.ts`, a Dockerfile (pnpm + Turborepo prune), reverse proxy configuration, and a GitHub Actions workflow for deployment.
Lock-in: minimal. But the operational burden is the largest.

## Decision (proposed)

**We recommend A (Vercel Hobby `hnd1` + Supabase Free Tokyo).**

Reason: of the four options, A is the only one that is expected to satisfy all of M1–M5 at $0 additional cost. App and DB can be aligned in Tokyo (M2), the Node.js `proxy.ts` and `pg` run without a rewrite (M3), and the platform provides WAF rate limiting (S1) and daily Cron (M5). The code changes amount to little more than `lib/db/index.ts` and config files, and because it is plain Next.js + plain Postgres, moving to D later is easy (S3).

Main trade-offs: (1) Vercel Hobby is **non-commercial only**. Once we monetize with ads or similar, Pro is required. (2) Supabase Free **pauses after 1 week of inactivity**. For a live service, real traffic should keep it from pausing, but whether it is allowed under the terms to keep it alive by pinging it periodically from outside is **Unverified**, so we do not rely on that. (3) The region `proxy.ts` runs in is unverified (below).

**The runner-up is D (an always-on VM in Tokyo, with the DB on Supabase Tokyo or on the VM).** Switch if any of the following happens.
- Going commercial makes a VM cheaper than paying for Vercel Pro.
- We consistently exceed the Hobby guideline (invocations or Active CPU) or the Supabase Free capacity.
- `proxy.ts` runs outside Tokyo and the redirect latency is unacceptable when measured.
- We need scheduled jobs more frequent than daily.

## Consequences

- **#28 Pool**: for serverless, make `max` smaller, the idle timeout shorter, and add `attachDatabasePool`. For `statement_timeout`, verify the option of moving it to a role-level setting to avoid depending on the pooler. For TLS, pass the CA and verify the certificate.
- **#29 startup validation**: what happens when `register()` calls `process.exit(1)` on Vercel (does the instance die and return 500, or does it show up as a failed deploy?) is **Unverified**. In serverless, the goal of #29 that "a deploy visibly fails" may not hold, so verify it on a preview. If needed, add a step that validates environment variables before deploying.
- **#33 rate limiting**: Vercel WAF (one rule on Hobby) can be the first candidate. Concrete thresholds and rules are not written in this repository; they are managed on the dashboard.
- **#35 data retention**: a natural fit is Vercel Cron (daily) hitting a route that runs the deletion. The Cron route needs authentication.
- **CI**: keep the GitHub Actions `check` as is. Deployment is left to Vercel's Git integration: production on push to `main`, previews on PRs. Vercel also runs the build, so do not break the current policy that the build does not need a DB (no `DATABASE_URL` in CI).
- **Environment variables**: set `DATABASE_URL` (the Supavisor transaction-mode URL), `BASE_URL`, `APP_TIME_ZONE`, and the variable for the CA certificate on Vercel. Decide how to handle the preview environment. Update the README's environment variable table and deploy instructions.

Follow-up issues to create (to be filed after this ADR is Accepted)
1. Deploy configuration for Vercel + Supabase (Root Directory, `hnd1`, environment variables, README deploy instructions).
2. Tune `lib/db/index.ts` for serverless (`max`, idle timeout, `attachDatabasePool`, moving `statement_timeout`).
3. TLS certificate verification for the DB connection (passing the CA and validating it in `env.ts`).
4. Verify the behavior of `process.exit(1)` on Vercel and, if needed, revisit the approach of #29.
5. Policy for the DB and `BASE_URL` for preview deployments.
6. Measure the region `proxy.ts` runs in and the redirect latency.
7. Make the #35 implementation concrete on the assumption of Vercel Cron.

## Open questions / risks

- Whether Next.js `proxy.ts` runs on Vercel in the function region (`hnd1`) or in multiple regions as Routing Middleware. In the latter case, the distance to the DB depends on where the user is, and a Pool is created per region, which also increases the number of connections.
- Whether transaction-mode Supavisor accepts `statement_timeout` as a startup parameter. Whether a role-level setting takes effect on connections through Supavisor.
- The behavior of `process.exit(1)` inside `register()` on Vercel.
- Vercel Pro pricing, and what happens when the Hobby guideline is exceeded (suspension or a notice).
- Whether it is acceptable to prevent a Supabase Free pause with periodic external access.
- Actual latency for each setup (app↔DB, user↔function). Figures from the research notes such as "under 5 ms within Tokyo" have no source and are not adopted.
- Fly.io Tokyo pricing, and whether Tokyo can be the home region on Oracle Cloud.
- Pricing and limits change. Re-check the sources when adopting.

## Sources (all checked on 2026-11-10)

1. Vercel Fair Use Guidelines — https://vercel.com/docs/limits/fair-use-guidelines
2. Vercel Configuring regions for Functions — https://vercel.com/docs/functions/configuring-functions/region
3. Vercel Global network and regions — https://vercel.com/docs/regions
4. Vercel Routing Middleware — https://vercel.com/docs/routing-middleware
5. Vercel Cron Jobs usage & pricing — https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing
6. Vercel WAF Rate Limiting — https://vercel.com/docs/vercel-firewall/vercel-waf/rate-limiting
7. Vercel `@vercel/functions` API reference — https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package
8. Vercel KB: Connection pooling with Functions — https://vercel.com/kb/guide/connection-pooling-with-functions
9. Supabase Pricing — https://supabase.com/pricing
10. Supabase Regions — https://supabase.com/docs/guides/platform/regions
11. Supabase Connecting to Postgres — https://supabase.com/docs/guides/database/connecting-to-postgres
12. Supabase SSL enforcement — https://supabase.com/docs/guides/platform/ssl-enforcement
13. Neon Regions — https://neon.com/docs/introduction/regions
14. Neon Pricing — https://neon.com/pricing
15. OpenNext Cloudflare — https://opennext.js.org/cloudflare
16. Cloudflare Workers pricing — https://developers.cloudflare.com/workers/platform/pricing/
17. Fly.io Pricing — https://docs.fly.io/about/pricing
18. Fly.io Regions — https://docs.fly.io/reference/regions/
19. Oracle Cloud Always Free resources — https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
20. Next.js Self-Hosting guide — https://nextjs.org/docs/app/guides/self-hosting
