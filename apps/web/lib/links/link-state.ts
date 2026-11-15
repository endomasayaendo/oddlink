import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { type linkActor, urlMappings } from "@/lib/db/schema";

/**
 * The only module that knows what the state columns of url_mappings mean (ADR 0002, M4).
 * Every reader decides "may this link be used / shown" through `isActiveLink` or `linkState`,
 * so redirect, analytics, preview and the proxy's checks can never disagree.
 */

export const LINK_STATES = ["active", "expired", "disabled", "deleted"] as const;
export type LinkState = (typeof LINK_STATES)[number];
export type LinkActor = (typeof linkActor.enumValues)[number];

/**
 * True for a link that may redirect: not deleted, not disabled and not expired. Built from the
 * table-qualified columns, so it works in `db.execute`, the query builder, UPDATE ... WHERE and joins.
 * `now()` is the same clock `linkState` uses.
 */
export const isActiveLink = sql`(${urlMappings.deletedAt} IS NULL AND ${urlMappings.disabledAt} IS NULL AND (${urlMappings.expiresAt} IS NULL OR ${urlMappings.expiresAt} > now()))`;

/**
 * The state of a link, in order of precedence deleted > disabled > expired > active.
 * `linkState = 'active'` holds exactly when `isActiveLink` does (pinned by tests, since the
 * `sql<LinkState>` type is an unchecked cast).
 */
export const linkState = sql<LinkState>`(CASE
  WHEN ${urlMappings.deletedAt} IS NOT NULL THEN 'deleted'
  WHEN ${urlMappings.disabledAt} IS NOT NULL THEN 'disabled'
  WHEN ${urlMappings.expiresAt} IS NOT NULL AND ${urlMappings.expiresAt} <= now() THEN 'expired'
  ELSE 'active'
END)`;

export type LinkStatus = { state: "active" | "expired" } | { state: "disabled"; by: LinkActor } | { state: "deleted"; by: LinkActor };

/** Read-only state lookup for one code; null when the code was never issued. */
export async function getLinkState(shortCode: string): Promise<LinkStatus | null> {
  const [row] = await db
    .select({ state: linkState, disabledBy: urlMappings.disabledBy, deletedBy: urlMappings.deletedBy })
    .from(urlMappings)
    .where(eq(urlMappings.shortCode, shortCode));
  if (!row) return null;
  return toLinkStatus(row.state, row.disabledBy, row.deletedBy);
}

/**
 * Narrows a selected `linkState` plus its actor columns into a `LinkStatus`. The CHECK constraints
 * `disabled_pair` / `deleted_pair` guarantee the actor is set whenever the state needs it.
 */
export function toLinkStatus(state: LinkState, disabledBy: LinkActor | null, deletedBy: LinkActor | null): LinkStatus {
  switch (state) {
    case "active":
    case "expired":
      return { state };
    case "disabled":
      return { state, by: requireActor(disabledBy, state) };
    case "deleted":
      return { state, by: requireActor(deletedBy, state) };
    default:
      throw new Error(`Unknown link state: ${String(state satisfies never)}`);
  }
}

function requireActor(actor: LinkActor | null, state: LinkState): LinkActor {
  if (actor === null) throw new Error(`Link is ${state} but has no actor`);
  return actor;
}
