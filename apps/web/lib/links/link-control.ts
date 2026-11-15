import { type SQL, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { LinkActor } from "@/lib/links/link-state";

/**
 * The only module that changes a link's state: disable, enable and delete (tombstone), ADR 0002.
 * Every rule (M5 ranks, tombstones, clearing logs, and in Phase 2 "only the owner of this row") is
 * enforced in the WHERE clause of the writing statement, and the failure reason is derived from the
 * row that same statement locked. Nothing is checked first and written afterwards.
 */

/** Who is acting. `owner` is ADR 0002 Phase 2 (ADR 0003) and is rejected until then. */
export type Principal = { actor: "operator" } | { actor: "automated" } | { actor: "owner"; userId: string };

/** Automation never deletes (CHECK deleted_by_not_automated); retention (#35) must decide its own path. */
export type DeletePrincipal = Exclude<Principal, { actor: "automated" }>;

export type ControlResult = { ok: true; changed: boolean } | { ok: false; reason: "not_found" | "deleted" | "not_allowed" };

/**
 * Higher ranks may override lower-ranked disables (operator > automated > owner), so an owner can
 * never undo an operator or automated disable (M5) and automation cannot undo the operator's.
 */
const OVERRIDABLE_DISABLES: Record<LinkActor, LinkActor[]> = {
  operator: ["automated", "owner"],
  automated: ["owner"],
  owner: [],
};

/**
 * Whose disables each actor may clear. Automation only takes links out of service; a human undoes
 * its false positives. The owner may clear only their own disables (Phase 2).
 */
const CLEARABLE_DISABLES: Record<LinkActor, LinkActor[]> = {
  operator: ["operator", "automated", "owner"],
  automated: [],
  owner: ["owner"],
};

type Outcome = "changed" | "unchanged" | "not_found" | "deleted" | "not_allowed";

/**
 * Takes a link out of service. Disabling a link that a lower-ranked actor already disabled
 * re-stamps it with this actor and time; one already disabled by the same or a higher rank is
 * left as is (`changed: false`).
 */
export async function disableLink(shortCode: string, principal: Principal): Promise<ControlResult> {
  const actor = phase1Actor(principal);
  const outcome = await mutate(
    shortCode,
    sql`disabled_at = now(), disabled_by = ${actor}`,
    sql`(b.disabled_at IS NULL OR b.disabled_by = ANY(${actorArray(OVERRIDABLE_DISABLES[actor])}))`,
    // The only way the rule fails on a live row is an existing disable of the same or a higher rank.
    sql`'unchanged'`,
  );
  return toResult(outcome);
}

/**
 * Puts a disabled link back in service. A link that is not disabled is `changed: false`; a disable
 * this actor may not clear (M5) is `not_allowed`.
 */
export async function enableLink(shortCode: string, principal: Principal): Promise<ControlResult> {
  const actor = phase1Actor(principal);
  const outcome = await mutate(
    shortCode,
    sql`disabled_at = NULL, disabled_by = NULL`,
    sql`b.disabled_at IS NOT NULL AND b.disabled_by = ANY(${actorArray(CLEARABLE_DISABLES[actor])})`,
    sql`CASE WHEN (SELECT disabled_at FROM before) IS NULL THEN 'unchanged' ELSE 'not_allowed' END`,
  );
  return toResult(outcome);
}

/**
 * Deletes a link irreversibly: the row stays as a tombstone that keeps its short_code forever (M3,
 * the phrase is never issued again), its URL and count are cleared, any disable is dropped, and
 * its access_log rows are removed. Deleting a tombstone again is `changed: false`.
 *
 * Two statements in one transaction rather than one CTE. Under READ COMMITTED a CTE's
 * `DELETE FROM access_log` would use the statement's start snapshot: if a redirect holding the row
 * lock commits its log row while the tombstone UPDATE waits for that lock, the DELETE would not see
 * that row and leave it behind. Statement (1) takes the row lock, so redirects after it wait and
 * then fail isActiveLink; statement (2) starts with a fresh snapshot that sees every log row
 * committed before the lock was ours.
 */
export async function deleteLink(shortCode: string, principal: DeletePrincipal): Promise<ControlResult> {
  const actor = phase1Actor(principal);
  return db.transaction(async (tx) => {
    // (1) Tombstone.
    const { rows } = await tx.execute<{ outcome: Outcome; id: string | null }>(
      controlStatement(
        shortCode,
        sql`original_url = NULL, access_count = 0, deleted_at = now(), deleted_by = ${actor}, disabled_at = NULL, disabled_by = NULL`,
        sql`TRUE`,
        sql`'unchanged'`,
      ),
    );
    const { outcome, id } = rows[0];
    // (2) Remove this link's logs, only when (1) made the tombstone.
    if (outcome === "changed") await tx.execute(sql`DELETE FROM access_log WHERE url_mapping_id = ${id}`);
    return toResult(outcome === "deleted" ? "unchanged" : outcome);
  });
}

async function mutate(shortCode: string, set: SQL, rule: SQL, ruleFailed: SQL): Promise<Outcome> {
  const { rows } = await db.execute<{ outcome: Outcome }>(controlStatement(shortCode, set, rule, ruleFailed));
  return rows[0].outcome;
}

/**
 * One statement that locks the row, applies `set` when it is live and `rule` holds, and reports why
 * not otherwise. `before` locks the latest committed version (READ COMMITTED re-reads it after
 * waiting), so the liveness check and `rule` must read `b`, never `u`: `u` is scanned with the
 * statement's start snapshot, and a stale `u` that fails the WHERE is skipped without EvalPlanQual
 * ever re-checking the newer row (e.g. an operator disable racing an enable would report
 * "already disabled" and leave the link active). With every condition on the locked `b`, the write
 * and the reason come from the same row version. `ruleFailed` is evaluated against `before` and only
 * for a live row on which `rule` did not hold.
 */
function controlStatement(shortCode: string, set: SQL, rule: SQL, ruleFailed: SQL): SQL {
  return sql`
    WITH before AS (
      SELECT id, deleted_at, disabled_at, disabled_by FROM url_mappings WHERE short_code = ${shortCode} FOR UPDATE
    ),
    changed AS (
      UPDATE url_mappings u
      SET ${set}
      FROM before b
      WHERE u.id = b.id AND b.deleted_at IS NULL AND ${rule}
      RETURNING u.id
    )
    SELECT
      CASE
        WHEN EXISTS (SELECT 1 FROM changed) THEN 'changed'
        WHEN NOT EXISTS (SELECT 1 FROM before) THEN 'not_found'
        WHEN (SELECT deleted_at FROM before) IS NOT NULL THEN 'deleted'
        ELSE ${ruleFailed}
      END AS outcome,
      (SELECT id FROM changed) AS id
  `;
}

function toResult(outcome: Outcome): ControlResult {
  switch (outcome) {
    case "changed":
      return { ok: true, changed: true };
    case "unchanged":
      return { ok: true, changed: false };
    case "not_found":
    case "deleted":
    case "not_allowed":
      return { ok: false, reason: outcome };
    default:
      throw new Error(`Unknown control outcome: ${String(outcome satisfies never)}`);
  }
}

/** Rejects `owner` before any DB access: ownership (owner_id) does not exist until Phase 2. */
function phase1Actor(principal: Principal): Exclude<LinkActor, "owner"> {
  if (principal.actor === "owner") throw new Error("owner control is ADR 0002 Phase 2");
  return principal.actor;
}

// A Postgres array literal; drizzle would expand a JS array into a parameter list instead.
// The values come from the fixed LinkActor enum, never from input.
function actorArray(actors: LinkActor[]): SQL {
  return sql`${`{${actors.join(",")}}`}::link_actor[]`;
}
