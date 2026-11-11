# 0003. Optional accounts and link ownership

- Status: Proposed (the owner decides; this document goes only as far as a recommendation)
- Date: 2026-11-11
- Related: ADR 0001 (Vercel Hobby `hnd1` + Supabase Tokyo), ADR 0002 (link lifecycle; Phase 2 depends on this ADR), #47 (owner control), #33 (rate limiting), #64 (preview environments), #35 (retention)

## Context

The PO decided on 2026-11-11 (#47) that:

- Issuing without login stays exactly as it is today: one step, no account. Anonymous links cannot be managed afterwards by anyone except the operator (ADR 0002).
- Login is **optional**. Links issued while logged in are **owned** by that user, who can list and manage them from any device.

So accounts are not a gate; they are an add-on for people who want control. The product trait we must protect is zero-friction anonymous shortening, and the hot path we must protect is the redirect. For reference, Dub is account-only, links belong to workspaces, and it offers Google, GitHub, email one-time codes, SSO and per-workspace API keys. We take its ownership idea, not its account requirement.

## Requirements

**must**
- M1. Anonymous issuing does not regress: no extra step, no login prompt in the way, no measurable slowdown.
- M2. Redirects (`/{code}`) never read a session or call an auth service. Neither do the `+` preview or the proxy's existence checks.
- M3. Every owner mutation checks authentication **and** ownership inside the Server Action, in the same SQL statement as the write (no IDOR).
- M4. Store the minimum personal data needed to log in. No passwords.
- M5. A user can delete their account, and what happens to their links is defined.
- M6. Works within ADR 0001's budget ($0 now) and keeps local development and CI on the Docker Postgres we use today, or something equally simple.

**should**
- S1. Low lock-in: users and links in our own Postgres, reachable with Drizzle.
- S2. Login works on production and locally; preview deployments may go without it (#64).
- S3. Small enough for one person to build and run.

## Options: auth provider

Facts checked on 2026-11-11 unless marked Unverified.

### A. Better Auth (open-source library, our Postgres)

- Has a Drizzle adapter for Postgres (`provider: "pg"`) and a CLI that generates its schema [1]. Users, sessions and OAuth accounts live in our database, next to `url_mappings`.
- Database sessions in an httpOnly cookie. Its Next.js guide recommends only checking that the session cookie **exists** in proxy/middleware and validating the session on the server for every protected page or action; a full check is possible on the Node.js runtime in Next.js 16 `proxy.ts` [2].
- Auth.js has become part of Better Auth (stated on authjs.dev) [3], so Better Auth is where that ecosystem is heading.
- Cost: $0 (a library). Local dev and CI: our existing Docker Postgres; nothing new to run.
- Lock-in: low. The tables are ours; leaving means writing a migration, not exporting users from a vendor.
- What it rules out: nothing hosted is doing security work for us. We own updates, secret rotation and the email provider if email login comes later.
- Unverified: whether profile fields (name, image) and OAuth access/refresh tokens can be left unstored by configuration; whether session tokens are stored hashed. Check at implementation.

### B. Supabase Auth (fits ADR 0001)

- Free plan includes 50,000 monthly active users; Pro is from $25/month with 100,000 MAU [4]. Free projects pause after a week of inactivity (already accepted in ADR 0001).
- Sessions are JWTs in cookies (`sb-<project_ref>-auth-token`). The Next.js guide uses `proxy.ts` to refresh tokens via `getClaims()`, which verifies the signature (locally with asymmetric keys), and says never to trust `getSession()` on the server [5]. We would limit that proxy work to account pages, because running it on every path would put auth on the redirect path (M2).
- The built-in email sender is "not meant for production use", only delivers to project team members, and is limited to 2 messages per hour; a custom SMTP provider is needed for real email login [6].
- Redirect allow-list supports wildcards for Vercel previews (`https://*-<team-or-account-slug>.vercel.app/**`), with exact URLs recommended for production [7].
- Local dev: the Supabase CLI stack (`supabase start`) includes Auth and needs Docker [8]. That replaces or sits beside our `docker-compose.yml`, and tests need the `auth` schema. More moving parts than today.
- Lock-in: medium. Users live in Supabase's `auth.users`; moving off Supabase (ADR 0001's runner-up is a VM) means migrating identities.

### C. Auth.js (NextAuth v5)

- Its v5 migration guide still installs v5 with the `beta` tag; with an adapter it defaults to database sessions, and edge contexts need a split config or JWT sessions [3]. The project is now part of Better Auth [3]. Choosing it today means choosing a library whose successor is option A.

### D. Clerk (hosted)

- Free plan: 50,000 monthly retained users per app; Pro $25/month [9]. Best-in-class hosted UI and passkeys out of the box (feature details beyond pricing Unverified).
- Lock-in: high; users live at Clerk. Where Clerk stores user data, and whether a Japan region exists, is Unverified. Its middleware would have to be kept off the redirect matcher.

### Comparison

| | A. Better Auth | B. Supabase Auth | C. Auth.js | D. Clerk |
|---|---|---|---|---|
| Cost now | $0 | $0 (50k MAU) | $0 | $0 (50k MRU) |
| Users stored | our Postgres | Supabase `auth` schema | our Postgres | Clerk |
| Session | DB session, cookie | JWT cookie, refreshed in proxy | DB or JWT | hosted session |
| Local dev | today's Docker Postgres | Supabase CLI stack | today's Docker Postgres | Clerk dev instance |
| Lock-in | low | medium | low | high |
| Status | active | active | v5 beta; folded into A | active |

## Login methods

- **GitHub OAuth**: zero cost, no email sending, our early users are likely developers. Least operational work.
- **Google OAuth**: zero cost, covers non-developers. Needs a Google Cloud consent screen with a privacy policy URL (exact verification requirements Unverified).
- **Email magic link / one-time code**: works for everyone but needs a sending provider, a sending domain (SPF/DKIM), bounce handling and abuse limits. For scale, Resend's free plan is 3,000 emails/month and 100/day [10]. It also makes our login form a tool for mailing strangers, so it needs rate limiting (#33) first.
- **Passkeys**: best UX once enrolled, but a passkey is normally added to an existing account, not the first login. Later.

**Recommended first set: GitHub + Google.** No email infrastructure, no passwords, and enough coverage. Email codes come later if users ask; passkeys after that.

No automatic account linking across providers in the first version: logging in with Google and later with GitHub creates two accounts. Linking by email is convenient but trusts each provider's email verification; it can be added deliberately later.

## Decision (proposed)

**Better Auth (A) with GitHub and Google OAuth, database sessions in our Postgres.**

Why: it keeps users next to links in one database under Drizzle (S1), changes nothing about local development or CI (M6), costs nothing, and is the maintained path of the Auth.js ecosystem. Database sessions can be revoked immediately (account deletion, logout everywhere), which JWTs cannot without extra machinery.

Runner-up: **Supabase Auth (B).** Switch if we want email login soon and prefer a hosted service to own the flows, or if keeping auth code current turns out to be more work than one person can carry. The price is the CLI stack locally and identities tied to Supabase.

### How sessions stay off the hot path (M1, M2)

- `proxy.ts` is not changed for auth. Its matcher keeps sending `/{code}`, `/{code}+`, `/analytics/{code}` and `/preview/{code}` to the existing middlewares with no session code. New account pages pass through as reserved keys.
- Sessions are read only in Server Components, Server Actions and `/api/auth/*` route handlers, through one server-only helper (`lib/auth/session.ts`, wrapped in React `cache()`).
- Issuing: `issueAction` asks for the session **only if the session cookie is present**. Anonymous visitors pay nothing. A logged-in issue costs one extra indexed lookup, then sets `owner_id`.
- New single-segment routes (`/login` if needed, `/links`, `/account`, `/privacy`) are added to `RESERVED_KEYS`; the existing test enforces this. Issued phrases always contain hyphens, so these names cannot collide with new codes; check that no existing row uses them before adding each one.

## Data model

Better Auth's tables (`user`, `session`, `account`, `verification`) are generated into `lib/db/schema.ts` and migrated with drizzle-kit like everything else. Then, per ADR 0002 Phase 2:

- `url_mappings.owner_id`: nullable FK to `user.id`, `ON DELETE RESTRICT`, with a partial index on non-null values. `NULL` means anonymous. **Never `CASCADE`**: a cascade would hard-delete link rows and free their phrases (ADR 0002, M3).
- Personal data kept: provider name and provider user id, email (used for account identity only; no marketing), session rows (token, expiry; IP and user agent left empty if configurable, Unverified). Not kept, if configurable: display name, avatar, OAuth access/refresh tokens. We never call provider APIs after login, so we do not need tokens.

**Account deletion** (a Server Action on `/account`, one transaction):
1. Tombstone every owned link (`deleted_by = 'owner'`, logs removed per ADR 0002).
2. Set `owner_id = NULL` on those tombstones.
3. Delete the user, sessions and accounts.

Alternative for the PO: keep owned links working and turn them anonymous instead. Shared links keep redirecting, but nobody but the operator can stop them afterwards, which is the opposite of what the user asked for when they deleted their account. Not recommended.

ADR 0002's Phase 2 check constraint should therefore forbid only `disabled_by = 'owner'` on an anonymous row; a tombstone with `deleted_by = 'owner'` and no owner is valid after account deletion. A disabled-by-owner link must be re-enabled or deleted before its owner disappears, which step 1 guarantees.

## What logged-in users get

1. `/links`: their links on any device, newest first, with state (active, expired, disabled, deleted) and click count. The `localStorage` history stays for anonymous visitors.
2. Delete, and disable/re-enable if the PO chooses it in ADR 0002, through `link-control.ts` with `{ actor: "owner", userId }`. An operator or automated disable shows as such and cannot be undone by the owner.
3. Analytics for their links (see below).
4. Not in scope: editing the destination (bait-and-switch, ADR 0002), custom phrases, custom expiry, workspaces or teams.

### Should analytics of owned links be private?

Today every analytics page is public to anyone who knows the code, by design. Options:

- **P1. Everything stays public.** Simplest; one code path. Owners get nothing private, and the login page must say so.
- **P2. Owned links are private to the owner; anonymous links stay public.** A real reason to log in, and closer to what users expect from an account. Two behaviours on one URL: non-owners get a "private" page (no counts, no destination). The `+` preview stays public for all links, because it is the safety feature.
- **P3. Owner chooses per link** (default private or public). Most flexible; one more setting, one more column.

Recommendation: **P2** now, P3 only if people ask to share stats. It costs a session read on `/analytics/{code}` for owned links only, which is off the redirect path.

## API

`POST /api/issue` stays anonymous and **does not accept the session cookie** for ownership. Cookie-authenticated route handlers do not get the Server Action Origin check [11], so letting cookies create owned links would open a CSRF path for little gain.

Per-user API keys (random, shown once, stored as a SHA-256 hash with a short visible prefix, revocable, `Authorization: Bearer`) would let scripts issue owned links. Recommended for a **later phase**, after owner management has real users; the hashing pattern is cheap to build, but it adds key management UI and another thing for #33 to limit.

## Claiming anonymous links

**There is no claim.** A claim needs proof that the person created the link. Without the delete token (dropped) the only proof would be the `localStorage` history, which anyone can edit, so a claim would let anyone take over any link whose code they know. Keeping anonymous links unmanageable is simpler, has no takeover risk, and matches what the home page promises.

## Security and privacy

- **CSRF**: owner mutations are Server Actions only. Next.js accepts them only via POST and compares `Origin` with `Host` [11]; session cookies are `HttpOnly`, `Secure`, `SameSite=Lax`. Better Auth's own endpoints have origin checks of their own (configuration details Unverified; verify `trustedOrigins` at implementation).
- **Session fixation**: a new session token is issued at login, never reused from before login; logout and account deletion delete the session rows.
- **OAuth redirect URIs and previews (#64)**: production and `localhost` have exact callback URLs registered with each provider. Preview deployments start **without login**: if the provider variables are absent, `lib/env.ts` treats auth as disabled and the UI hides the login buttons. Wildcard callbacks for previews can be added later per provider if needed.
- **Rate limiting (#33)**: covers the login start and callback endpoints and owner mutations, in addition to issuing. Thresholds stay out of this repository.
- **Secrets**: the auth secret and OAuth client secrets go in Vercel environment variables and `.env.example` gets placeholders only.
- **Privacy note page (`/privacy`)**: what is stored for anonymous links (URL, timestamps, click times), what is stored for accounts (provider, provider id, email, sessions), why, how long (#35), how to delete an account, and the contact address. Obligations under Japan's Act on the Protection of Personal Information are **Unverified** and must be checked before login launches.

## Consequences

- ADR 0002 Phase 2 can start after Phase 1 of this ADR; its `owner_id` FK targets Better Auth's `user` table.
- New environment variables (auth secret, GitHub and Google client id/secret), all optional outside production.
- New tables and one migration; CI is unchanged (same Postgres container).
- The home page gains a small "Log in to manage your links later" entry and the "anonymous links can't be changed" note (ADR 0002). Issuing itself is unchanged.
- We now hold personal data, so the privacy page and account deletion ship together with login, not after.

Follow-up issues (after acceptance)
1. Auth setup: Better Auth + Drizzle tables, GitHub and Google, session helper, env handling, reserved keys.
2. Owned issuing: set `owner_id` when a session exists.
3. `/links` page and owner management (ADR 0002 Phase 2).
4. Analytics privacy for owned links (if P2/P3).
5. `/account` with account deletion; `/privacy` page.
6. Verify personal-data obligations in Japan.
7. Later: per-user API keys; email one-time codes; passkeys.

### Effort

| Phase | Scope | Effort |
|---|---|---|
| 1 | Auth setup, login/logout, owned issuing, `/privacy`, account deletion | M |
| 2 | `/links` and owner management (ADR 0002 Phase 2) | M |
| 3 | Private analytics for owned links | S |
| 4 | API keys | M |
| 5 | Email one-time codes (provider, domain, limits) | M |

## Open questions / risks

- **For the owner to decide:**
  - Better Auth (recommended) or Supabase Auth.
  - First login methods: GitHub + Google (recommended), or GitHub only.
  - Analytics of owned links: P1 public, P2 private (recommended), or P3 per link.
  - On account deletion: tombstone owned links (recommended) or turn them anonymous.
  - API keys: later phase (recommended) or with Phase 2.
  - Whether to launch login only after #33 rate limiting is in place (recommended).
- Separate accounts per provider may confuse users who log in with a different provider.
- Better Auth configuration details marked Unverified above.
- Personal-data law in Japan (Unverified).

## Sources (checked 2026-11-11)

1. Better Auth, Drizzle adapter — https://www.better-auth.com/docs/adapters/drizzle
2. Better Auth, Next.js integration — https://www.better-auth.com/docs/integrations/next
3. Auth.js, Migrating to v5 — https://authjs.dev/getting-started/migrating-to-v5
4. Supabase Pricing — https://supabase.com/pricing
5. Supabase, Server-side Auth for Next.js — https://supabase.com/docs/guides/auth/server-side/nextjs
6. Supabase, Custom SMTP — https://supabase.com/docs/guides/auth/auth-smtp
7. Supabase, Redirect URLs — https://supabase.com/docs/guides/auth/redirect-urls
8. Supabase, Local development — https://supabase.com/docs/guides/local-development
9. Clerk Pricing — https://clerk.com/pricing
10. Resend Pricing — https://resend.com/pricing
11. Next.js, Data Security (Server Actions) — https://nextjs.org/docs/app/guides/data-security
