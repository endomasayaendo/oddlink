# 0002. Link lifecycle and control (disable, delete, and who may do it)

- Status: Proposed (the owner decides; this document goes only as far as a recommendation)
- Date: 2026-11-11
- Related: #34 (operator disable), #47 (creator delete key, on hold), #50 (threat-list checks), #48 (crawler cards), #35 (retention), #33 (rate limiting), #31 (real 404), #46 / PR #56 (`+` preview)

## Context

Today a short link can never be stopped. Issuing is anonymous, and once a row is in `url_mappings` it redirects until it expires a year later. The only way to stop it is to `DELETE` the row by hand, which also cascades away its `access_log` rows and frees the phrase to be issued again.

Three kinds of actors need to stop a link, for different reasons:

- **The creator.** They pasted the wrong URL, shared something they regret, or the destination now holds private data. The research behind #47 found "can't delete or fix it later" to be a typical complaint about shorteners. The owner has decided that both deleting and disabling are needed (#47 comment).
- **The operator.** The link points to phishing, malware or illegal content, or there is a legal or takedown request. A free, anonymous public shortener is an obvious tool for hiding a destination. If abuse is not stopped quickly, the whole domain can end up on blocklists and every legitimate link stops working.
- **Automated checks.** #50 will check destinations against threat lists when a link is issued, and possibly re-check existing links later. A re-check needs a way to take a link out of service without a human, and a human needs a way to undo a false positive.

This blocks #48. Returning an OddLink card to social-media crawlers hides the real destination from the platforms' scanners, which makes a card-serving shortener attractive to phishers. The owner decided (#48 comment, 2026-11-10) that cards wait until abusive links can be stopped (#34) and checked (#50).

Accounts are the open question. With a login, "who created this" is easy and a delete key would not be needed. But a login works against OddLink's main product trait, zero-friction shortening, and that is why #47 is on hold. For comparison (research checked by the lead on 2026-11-10): Bitly, dub and Short.io dropped anonymous shortening or never offered it. is.gd keeps anonymous links permanent and undeletable on purpose, so a link cannot be pointed somewhere else after it has been shared (bait-and-switch; stated in its FAQ). v.gd always shows a preview page. Kutt lets the operator disable anonymous links. Imgur and 0x0.st give the uploader a delete token.

## Requirements

**must**
- M1. Issuing stays anonymous and one step. Nothing in this ADR adds a login.
- M2. The operator can stop any link immediately, including links issued before this change.
- M3. A phrase that has ever been issued is never issued again for a different URL.
- M4. Every reader (redirect, analytics, preview, the proxy's existence checks) sees the same link state. They cannot drift apart.
- M5. A disable done by the operator or by automation cannot be undone by the creator.

**should**
- S1. The creator can delete or disable their own link without an account.
- S2. The data model leaves room for optional accounts and for claiming anonymous links later.
- S3. Disabling is reversible. Deleting is not.
- S4. Small enough for one person to build and run.

## Concepts

| | Active | Expired | **Disabled** | **Deleted** |
|---|---|---|---|---|
| Redirect | 302 | 404 (as #31) | **410**, no count, no log | **410** |
| Analytics page | full | full | state banner; destination hidden unless disabled by the creator | 410 page, no data |
| `+` preview | full | "expired" | 410 page, no destination | 410 page |
| `access_log` | kept | kept (until #35) | kept (evidence, re-enable) | **removed**, count reset to 0 |
| `original_url` | kept | kept | kept | **set to NULL** |
| Phrase | reserved | reserved | reserved | **reserved forever (tombstone)** |
| Reversible | | | yes, by whoever may act on that reason | no |

**Disabled** takes a link out of service and keeps everything. It is what the operator and automation normally use, because it keeps evidence and a false positive can be undone.

**Deleted** removes the data and leaves a tombstone: the row stays with its `short_code`, its timestamps and who deleted it, and nothing else. Hard-deleting the row would free the phrase under the `UNIQUE` constraint, and a later issue could get the same phrase for a different URL. Anyone who saved or shared the old link would then land on a stranger's destination. That is the bait-and-switch that is.gd prevents by never deleting, so tombstones are required (M3). The same argument applies to #35: retention may empty out expired rows, but must not `DELETE` them.

**Reason codes.** Who acted is stored as one of `creator`, `operator` or `automated`, together with a timestamp. Free-text notes about abuse cases are not kept in the database; the operator keeps them privately.

## Data model

Changes to `apps/web/lib/db/schema.ts` (one migration; existing rows stay active and have no token):

```ts
export const linkActor = pgEnum("link_actor", ["creator", "operator", "automated"]);

export const urlMappings = pgTable(
  "url_mappings",
  {
    // ...existing columns...
    originalUrl: text("original_url"), // NULL only on a deleted tombstone
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledBy: linkActor("disabled_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: linkActor("deleted_by"),
    // Hex SHA-256 of the creator's token. NULL for links issued before tokens and on tombstones.
    deleteTokenHash: char("delete_token_hash", { length: 64 }),
  },
  (t) => [
    check("disabled_pair", sql`(${t.disabledAt} IS NULL) = (${t.disabledBy} IS NULL)`),
    check("deleted_pair", sql`(${t.deletedAt} IS NULL) = (${t.deletedBy} IS NULL)`),
    check("deleted_by_not_automated", sql`${t.deletedBy} <> 'automated'`),
    check("url_unless_deleted", sql`${t.deletedAt} IS NOT NULL OR ${t.originalUrl} IS NOT NULL`),
    check("tombstone_is_empty", sql`${t.deletedAt} IS NULL OR (${t.originalUrl} IS NULL AND ${t.deleteTokenHash} IS NULL)`),
  ],
);
```

No `owner_id` column now. Adding a nullable foreign key later, when accounts exist, is a cheap additive migration, and adding it now would freeze a decision we have not made.

### One place for the "active link" predicate

Add `lib/links/link-state.ts` and make it the only module that knows what the columns mean:

- `isActiveLink`: a Drizzle `sql` fragment, `deleted_at IS NULL AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, built from the `urlMappings` columns so it works in both `db.execute` and the query builder.
- `linkState`: a `CASE` expression that returns `'deleted' | 'disabled' | 'expired' | 'active'`, in that order of precedence.

Each reader uses one of them:
- `resolveShortCode` puts `isActiveLink` in the `UPDATE ... WHERE` (the URL scheme check and `toRedirectUrl` stay as they are). When nothing matches, the middleware makes a second, read-only `linkState` lookup, used only to choose between 404 and 410. The hot path stays one statement.
- `shortCodeExists` becomes `getLinkState(shortCode)`. The analytics middleware sends 410 for `deleted`.
- `getAnalytics` and `getLinkPreview` select `linkState` and `disabled_by` instead of computing `expired` themselves (PR #56 already leaves a comment for this).
- State changes (`disableLink`, `enableLink`, `deleteLink`) also live in one module, `lib/links/link-control.ts`. The rules (M5, tombstoning, clearing logs) are enforced in the `WHERE` clause of a single statement, not checked first and written afterwards.

A table-driven test runs every reader against one row in each state, so a new reader that ignores a state fails CI.

## Who can act: options

### (a) Creator delete token

When a link is issued, the server generates a random token with enough entropy that guessing is not feasible, stores only its SHA-256 hash, and returns the token once. A fast hash is enough because the token is random rather than a password. The home page stores it with the link in the existing `localStorage` history. `POST /api/issue` also returns it as an additive `deleteToken` field; otherwise API users could never delete. Management calls (e.g. `DELETE /api/links/{code}` and a disable/enable call, with the token in an `Authorization` header) answer 404 for both an unknown code and a wrong token, so they do not reveal which one it was.

- UX: no change to issuing. Delete and disable buttons appear in the history list. A lost token cannot be recovered, and the UI must say so. Clearing browser data or switching device loses control of the link. A "management link" the user can bookmark, with the token in the URL fragment so it does not reach server logs, partly fixes this (UI choice, see below).
- Enables: S1, and later claiming (c).
- Effort: M (#47).
- Risks: tokens in `localStorage` are exposed to any XSS on our origin, but only for links in that browser, and the worst outcome is deleting them. Management endpoints need rate limiting (#33).
- Reversible: yes. Dropping the feature means ignoring the column.

### (b) Operator-only tooling

A script (`pnpm --filter web link:disable|enable|delete <code>`) that calls `link-control.ts` with `operator`. No admin web route until there is a proper authentication story for one; a shared-secret admin page is the kind of thing that leaks.

- UX: none for users. Enables M2 and closes #34. Effort: S. Risk: the operator needs DB credentials on their machine, which they already need for SQL. Fully reversible.

### (c) Optional accounts with claim

Login stays optional, and issuing anonymously keeps working. A signed-in user can claim an anonymous link by presenting its token, which sets `owner_id`. Whether the token stays valid after a claim is decided then.

- UX: adds a login screen for those who want it. Issuing does not change. Enables cross-device management, link lists, and later editing or custom expiry.
- Effort: L (auth provider, sessions, privacy policy, account deletion, more abuse surface). ADR 0001 notes that Supabase Auth would be available.
- Risks: personal data enters a hobby project, and paid features become tempting. Hard to reverse once users rely on it.

## Decision (proposed)

**A phased path: (b) now, (a) next, (c) only by a later ADR.**

1. **Phase 1 (build first): states + operator control + reporting.** The migration, `link-state.ts`, `link-control.ts`, the CLI, the 410 handling below, and the abuse mailbox. This closes #34, meets M2–M5, and together with #50 unblocks #48. It changes no UX and makes no decision about accounts.
2. **Phase 2: creator token (#47).** Issue returns the token. History gets delete and disable/enable. A creator can re-enable only a disable that has `disabled_by = 'creator'`.
3. **Phase 3 (optional, separate ADR): accounts and claim**, only if usage shows that people need to manage links across devices.

Why not accounts first: they solve creator control but not M2 (operator and automated disable, and old anonymous links), they cost the zero-friction UX the owner is worried about, and the token gives most of the creator benefit at no friction. Why not is.gd's "never deletable": the owner wants creator deletion, and tombstones already prevent bait-and-switch.

Runner-up: (b) only, i.e. is.gd's model with operator disabling. Switch to it if the token management UI turns out to cause more support load or abuse than it is worth.

## Abuse reporting (minimal)

A dedicated reporting email address, linked from the footer, from the preview page and from the 410 page ("Report this link", a `mailto:` with the short code filled in). The operator reviews reports and uses the CLI. A web form is deferred: it needs its own spam protection, and email works at this scale. How quickly takedown requests must be handled under Japanese law is **Unverified** and must be checked before public launch.

## HTTP behaviour

- Unknown and expired: unchanged from #31 (404, rewritten static page, `NOT_FOUND_CACHE_CONTROL`). Whether expired should become 410 is left to #35.
- Disabled and deleted: **410 Gone** from a static page rewritten under the requested URL, with the same no-store `Cache-Control` (a creator disable can be undone) and `X-Robots-Tag: noindex`. 410 tells link checkers and crawlers that the link existed and was removed on purpose. The page says "This link was disabled" or "deleted". For `operator` and `automated` it adds a generic "because it was reported or flagged as unsafe", which warns the person who clicked without exposing how links are detected.
- Redirect (302) responses must not be stored by shared caches, so that a disable takes effect immediately. Verify this on the deploy target from ADR 0001.
- Analytics and preview never show the destination of a link disabled by `operator` or `automated`, because both pages are public to anyone who knows the code.

## Consequences

- **#34**: done by Phase 1.
- **#47**: unblocked without accounts. Its open questions are answered: both delete and disable; delete removes logs; the token is hashed and cannot be recovered; the API returns it.
- **#48**: may start once Phase 1 and #50 land. Cards are served only for links in the `active` state.
- **#50**: writes `disabled_by = 'automated'` through `link-control.ts`. Detection details stay out of this repository.
- **#35**: retention must tombstone and never `DELETE` rows. Phrases stay reserved forever, so the phrase space slowly fills; watch the collision warnings `issueShortUrl` already logs.
- **#33**: also covers the management endpoints.
- `original_url` becomes nullable, and the type change spreads to readers. The state helper keeps that contained.
- Existing links have no token and can only be controlled by the operator.

Follow-up issues to create (after this ADR is Accepted)
1. Link states: migration, `link-state.ts`, `link-control.ts`, tests per state.
2. Operator CLI for disable/enable/delete.
3. 410 page and handling for redirect, analytics and preview.
4. Abuse reporting address and "Report this link" entry points.
5. Re-scope #47 to Phase 2 (token on issue, API field, history UI, management link).
6. Update #35 to require tombstones.
7. Check legal takedown obligations in Japan.

## Open questions / risks

- **For the owner to decide:** the phased path; 410 vs 404 for disabled/deleted; whether creators get disable/enable or only delete; whether the API returns the token; whether to offer a bookmarkable management link; whether deletion removes `access_log` rows (recommended) or keeps aggregates.
- Whether redirects and the 410 page are cached anywhere on the chosen platform (verify on deploy).
- A tombstone still reveals that a phrase once existed. This is judged acceptable.
- Japanese legal requirements for takedowns and log retention (**Unverified**).
