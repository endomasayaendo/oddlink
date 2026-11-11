# 0002. Link lifecycle and control (disable, delete, and who may do it)

- Status: Proposed (the owner decides; this document goes only as far as a recommendation)
- Date: 2026-11-11 (revised the same day after the PO decision on #47)
- Related: #34 (operator disable), #47 (creator control; re-scoped), #50 (threat-list checks), #48 (crawler cards), #35 (retention), #33 (rate limiting), #31 (real 404), #46 / PR #56 (`+` preview), ADR 0003 (optional accounts)

## Context

Today a short link can never be stopped. Issuing is anonymous, and once a row is in `url_mappings` it redirects until it expires a year later. The only way to stop it is to `DELETE` the row by hand, which also cascades away its `access_log` rows and frees the phrase to be issued again.

Three kinds of actors need to stop a link, for different reasons:

- **The operator.** The link points to phishing, malware or illegal content, or there is a legal or takedown request. A free, anonymous public shortener is an obvious tool for hiding a destination. If abuse is not stopped quickly, the whole domain can end up on blocklists and every legitimate link stops working.
- **Automated checks.** #50 will check destinations against threat lists when a link is issued, and possibly re-check existing links later. A re-check needs a way to take a link out of service without a human, and a human needs a way to undo a false positive.
- **The owner of the link.** They pasted the wrong URL, shared something they regret, or the destination now holds private data. The research behind #47 found "can't delete or fix it later" to be a typical complaint about shorteners, and the PO decided that both deleting and disabling are needed (#47 comment).

This blocks #48. Returning an OddLink card to social-media crawlers hides the real destination from the platforms' scanners, which makes a card-serving shortener attractive to phishers. The PO decided (#48 comment, 2026-11-10) that cards wait until abusive links can be stopped (#34) and checked (#50).

### PO decision, 2026-11-11 (#47)

The first draft of this ADR proposed a creator delete token kept in `localStorage`. The PO rejected it: the token only works on the device that created the link, which is the wrong mechanism. The decision instead:

- **Issuing without login stays exactly as today** (one step, no account). Links issued this way **cannot be managed afterwards by anyone except the operator**. Abuse is handled by report → operator disables. This is is.gd's model: its FAQ states that anonymous links are permanent so they cannot be pointed somewhere else after being shared (bait-and-switch). The home page says so in one short line.
- **Login is optional** (designed in ADR 0003). Links issued while logged in are **owned** by that user, who can view and manage them from any device.

For comparison (research checked by the lead on 2026-11-10): Bitly, Dub and Short.io require an account; Dub's links belong to workspaces and it offers Google, GitHub, email one-time codes and SSO. Kutt lets the operator disable anonymous links.

## Requirements

**must**
- M1. Issuing stays anonymous and one step. Nothing in this ADR adds friction to anonymous issuing.
- M2. The operator can stop any link immediately, including links issued before this change.
- M3. A phrase that has ever been issued is never issued again for a different URL.
- M4. Every reader (redirect, analytics, preview, the proxy's existence checks) sees the same link state. They cannot drift apart.
- M5. A disable done by the operator or by automation cannot be undone by the link's owner.
- M6. Anonymous links have no owner and no management path other than the operator. There is no "claim" (see ADR 0003).

**should**
- S1. A logged-in owner can delete their own links, and possibly disable and re-enable them (ADR 0003, PO decision below).
- S2. The data model needs only additive changes when ownership arrives.
- S3. Disabling is reversible. Deleting is not.
- S4. Small enough for one person to build and run.

## Concepts

| | Active | Expired | **Disabled** | **Deleted** |
|---|---|---|---|---|
| Redirect | 302 | 404 (as #31) | **410 or 404** (PO), no count, no log | **410 or 404** (PO) |
| Analytics page | full | full | state banner; destination hidden unless disabled by the owner | gone page, no data |
| `+` preview | full | "expired" | gone page, no destination | gone page |
| `access_log` | kept | kept (until #35) | kept (evidence, re-enable) | **removed**, count reset to 0 (recommended; PO) |
| `original_url` | kept | kept | kept | **set to NULL** |
| Phrase | reserved | reserved | reserved | **reserved forever (tombstone)** |
| Reversible | | | yes, by whoever may act on that reason | no |

**Disabled** takes a link out of service and keeps everything. It is what the operator and automation normally use, because it keeps evidence and a false positive can be undone.

**Deleted** removes the data and leaves a tombstone: the row stays with its `short_code`, its timestamps and who deleted it, and nothing else. Hard-deleting the row would free the phrase under the `UNIQUE` constraint, and a later issue could get the same phrase for a different URL. Anyone who saved or shared the old link would then land on a stranger's destination. That is the bait-and-switch that is.gd prevents by never deleting, so tombstones are required (M3). The same argument applies to #35: retention may empty out expired rows, but must not `DELETE` them.

**Actors.** Who acted is stored as one of `owner`, `operator` or `automated`, together with a timestamp. `owner` is unused until Phase 2, but it is in the enum from the start so that Phase 2 needs no enum migration. Free-text notes about abuse cases are not kept in the database; the operator keeps them privately.

## Data model

### Phase 1

Changes to `apps/web/lib/db/schema.ts` (one migration; existing rows stay active):

```ts
export const linkActor = pgEnum("link_actor", ["owner", "operator", "automated"]);

export const urlMappings = pgTable(
  "url_mappings",
  {
    // ...existing columns...
    originalUrl: text("original_url"), // NULL only on a deleted tombstone
    disabledAt: timestamp("disabled_at", { withTimezone: true }),
    disabledBy: linkActor("disabled_by"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedBy: linkActor("deleted_by"),
  },
  (t) => [
    check("disabled_pair", sql`(${t.disabledAt} IS NULL) = (${t.disabledBy} IS NULL)`),
    check("deleted_pair", sql`(${t.deletedAt} IS NULL) = (${t.deletedBy} IS NULL)`),
    check("deleted_by_not_automated", sql`${t.deletedBy} <> 'automated'`),
    check("url_unless_deleted", sql`${t.deletedAt} IS NOT NULL OR ${t.originalUrl} IS NOT NULL`),
    check("tombstone_is_empty", sql`${t.deletedAt} IS NULL OR ${t.originalUrl} IS NULL`),
  ],
);
```

### Phase 2 (with ADR 0003)

One additive migration: `owner_id` as a **nullable** foreign key to the users table that ADR 0003 introduces, plus a partial index on `owner_id WHERE owner_id IS NOT NULL` for the "my links" list. `NULL` means anonymous, which covers every existing row. A check `owner_id IS NOT NULL OR (disabled_by IS DISTINCT FROM 'owner' AND deleted_by IS DISTINCT FROM 'owner')` keeps the `owner` actor from appearing on an anonymous link.

**Recommendation: add `owner_id` in Phase 2, not now.** A foreign key needs its target table, and the users table's shape depends on the auth library that ADR 0003 chooses. A bare nullable column without the FK would be dead weight and would invite writes that nothing validates. Adding a nullable column is a cheap metadata-only change in Postgres, so waiting costs nothing. What Phase 1 does to stay compatible: the `owner` actor value already exists, and `link-control.ts` takes the acting principal as a parameter (`{ actor: "operator" } | { actor: "owner", userId }`), so Phase 2 adds a branch instead of changing signatures.

What happens to owned links when an account is deleted is decided in ADR 0003.

### One place for the "active link" predicate

Add `lib/links/link-state.ts` and make it the only module that knows what the columns mean:

- `isActiveLink`: a Drizzle `sql` fragment, `deleted_at IS NULL AND disabled_at IS NULL AND (expires_at IS NULL OR expires_at > now())`, built from the `urlMappings` columns so it works in both `db.execute` and the query builder.
- `linkState`: a `CASE` expression that returns `'deleted' | 'disabled' | 'expired' | 'active'`, in that order of precedence.

Each reader uses one of them:
- `resolveShortCode` puts `isActiveLink` in the `UPDATE ... WHERE` (the URL scheme check and `toRedirectUrl` stay as they are). When nothing matches, the middleware makes a second, read-only `linkState` lookup, used only to choose the response for a missing, disabled or deleted link. The hot path for an active link stays one statement and needs no session or auth lookup.
- `shortCodeExists` becomes `getLinkState(shortCode)`. The analytics middleware sends the "gone" response for `deleted`.
- `getAnalytics` and `getLinkPreview` select `linkState` and `disabled_by` instead of computing `expired` themselves (PR #56 already leaves a comment for this).
- State changes (`disableLink`, `enableLink`, `deleteLink`) live in one module, `lib/links/link-control.ts`. The rules (M5, tombstoning, clearing logs, and in Phase 2 "only the owner of this row") are enforced in the `WHERE` clause of a single statement, not checked first and written afterwards.

A table-driven test runs every reader against one row in each state, so a new reader that ignores a state fails CI.

## Options considered

### (a) Operator-only control (is.gd model plus operator disable)

A script (`pnpm --filter web link:disable|enable|delete <code>`) that calls `link-control.ts` with `operator`. No admin web route until there is a proper authentication story for one; a shared-secret admin page is the kind of thing that leaks.

- UX: none for users. Enables M2 and closes #34. Effort: S. Risk: the operator needs DB credentials on their machine, which they already need for SQL. Fully reversible.

### (b) Creator delete token — rejected by the PO (2026-11-11)

A random token returned at issue time and kept in `localStorage`. Rejected because control is tied to one browser on one device, a lost token cannot be recovered, and it adds a second, weaker identity mechanism next to accounts. Recorded here so it is not proposed again without new information.

### (c) Owner management for logged-in users

Links issued while logged in get `owner_id`. The owner sees them on every device and can delete them (and, if the PO agrees, disable and re-enable). Anonymous links are unaffected and stay operator-only. Authentication, sessions and personal data are designed in ADR 0003.

- UX: issuing does not change for anyone. Logged-in users get a "my links" page.
- Effort: M on top of ADR 0003's auth work.
- Risks: management endpoints are new abuse surface (#33); every mutation must check ownership in the same statement (IDOR).

## Decision (proposed)

**Phase 1 = (a) now. Phase 2 = (c), after ADR 0003 is accepted.**

1. **Phase 1 (build first): link states + operator control + reporting.** The migration, `link-state.ts`, `link-control.ts`, the operator CLI, the HTTP handling below, the abuse mailbox, and a one-line note on the home page that links issued without login cannot be changed or deleted later. This closes #34, meets M2–M6, and together with #50 unblocks #48. It changes no issuing UX and does not depend on ADR 0003.
2. **Phase 2: owner management.** Add `owner_id`; issue sets it when a session is present; owners list and manage their links through `link-control.ts` with `{ actor: "owner", userId }`. An owner can re-enable only a disable that has `disabled_by = 'owner'` (M5). Depends on ADR 0003.

Runner-up: stop after Phase 1 (pure is.gd model with operator disabling). Switch to it if ADR 0003 is rejected or deferred; nothing in Phase 1 has to be undone.

## Abuse reporting (minimal)

A dedicated reporting email address, linked from the footer, from the preview page and from the gone page ("Report this link", a `mailto:` with the short code filled in). The operator reviews reports and uses the CLI. A web form is deferred: it needs its own spam protection, and email works at this scale. How quickly takedown requests must be handled under Japanese law is **Unverified** and must be checked before public launch.

## HTTP behaviour

- Unknown and expired: unchanged from #31 (404, rewritten static page, `NOT_FOUND_CACHE_CONTROL`). Whether expired should become 410 is left to #35.
- Disabled and deleted: **open for the PO — 410 Gone or 404.** Recommended: 410, from a static page rewritten under the requested URL, with the same no-store `Cache-Control` (a disable can be undone) and `X-Robots-Tag: noindex`. 410 tells link checkers and crawlers that the link existed and was removed on purpose, so they drop it. The argument for 404: it reveals nothing beyond "not here", and keeps one code path. Either way the page says "This link was disabled" or "deleted". For `operator` and `automated` it adds a generic "because it was reported or flagged as unsafe", which warns the person who clicked without exposing how links are detected.
- Redirect (302) responses must not be stored by shared caches, so that a disable takes effect immediately. Verify this on the deploy target from ADR 0001.
- Analytics and preview never show the destination of a link disabled by `operator` or `automated`, because both pages are public to anyone who knows the code. (Whether analytics of owned links become private is an ADR 0003 question.)

## Consequences

- **#34**: done by Phase 1.
- **#47**: re-scoped. The delete token is dropped; creator control becomes owner management in Phase 2, which depends on ADR 0003. Its open questions move to the list below.
- **#48**: may start once Phase 1 and #50 land. Cards are served only for links in the `active` state.
- **#50**: writes `disabled_by = 'automated'` through `link-control.ts`. Detection details stay out of this repository.
- **#35**: retention must tombstone and never `DELETE` rows. Phrases stay reserved forever, so the phrase space slowly fills; watch the collision warnings `issueShortUrl` already logs.
- **#33**: will also cover the Phase 2 management endpoints.
- `original_url` becomes nullable, and the type change spreads to readers. The state helper keeps that contained.
- Existing links and every link issued without login can only be controlled by the operator. The home page must say this, so nobody expects a delete button later.

Follow-up issues to create (after this ADR is Accepted)
1. Link states: migration, `link-state.ts`, `link-control.ts`, tests per state.
2. Operator CLI for disable/enable/delete.
3. Gone handling (410 or 404 per the PO) for redirect, analytics and preview.
4. Abuse reporting address, "Report this link" entry points, and the "anonymous links can't be changed later" note on the home page.
5. Re-scope #47 to Phase 2 owner management (blocked on ADR 0003).
6. Update #35 to require tombstones.
7. Check legal takedown obligations in Japan.

## Open questions / risks

- **For the owner to decide:**
  - 410 or 404 for disabled and deleted links (recommended: 410).
  - Whether owners get disable/enable as well as delete, or only delete (recommended: both; disable is the safe, reversible choice when someone is unsure).
  - Whether deleting removes the link's `access_log` rows (recommended) or keeps aggregate counts.
  - Japanese legal obligations for takedowns and log retention (**Unverified**; must be checked before public launch).
- Whether redirects and the gone page are cached anywhere on the chosen platform (verify on deploy).
- A tombstone still reveals that a phrase once existed. This is judged acceptable.
- Users who expected to delete an anonymous link will have no self-service path. The home page note and the report address are the mitigation.
