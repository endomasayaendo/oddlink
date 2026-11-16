import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, check, index, integer, pgEnum, pgTable, primaryKey, text, timestamp, varchar } from "drizzle-orm/pg-core";

/** Column length of url_mappings.short_code; issuing regenerates phrases longer than this. */
export const SHORT_CODE_MAX_LENGTH = 255;

/**
 * Longest word allowed in the word tables. The longest pattern (C) is 5 words + "with" + 5 hyphens,
 * so 5w + 9 <= SHORT_CODE_MAX_LENGTH gives w <= 49 and every phrase fits in short_code.
 */
export const WORD_MAX_LENGTH = Math.floor((SHORT_CODE_MAX_LENGTH - "with".length - 5) / 5);

/** Who disabled or deleted a link. */
export const linkActor = pgEnum("link_actor", ["owner", "operator", "automated"]);

/**
 * Short links. What the state columns mean (active / expired / disabled / deleted) is decided
 * only in lib/links/link-state.ts; readers must go through it.
 */
export const urlMappings = pgTable(
  "url_mappings",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    // UNIQUE already creates an index; no separate index on short_code.
    shortCode: varchar("short_code", { length: SHORT_CODE_MAX_LENGTH }).notNull().unique(),
    // NULL only on a deleted tombstone (see the url_unless_deleted / tombstone_is_empty checks).
    originalUrl: text("original_url"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    accessCount: bigint("access_count", { mode: "number" }).notNull().default(0),
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

export const accessLog = pgTable(
  "access_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    urlMappingId: bigint("url_mapping_id", { mode: "number" })
      .notNull()
      // RESTRICT: link rows are never deleted (a deleted link stays as a tombstone), so a DELETE must fail.
      .references(() => urlMappings.id, { onDelete: "restrict" }),
    accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Leading url_mapping_id serves per-link lookups (deletes, FK checks); accessed_at orders a link's rows by time.
  (t) => [index("idx_access_log_url_mapping_id_accessed_at").on(t.urlMappingId, t.accessedAt)],
);

const wordTable = (name: string) =>
  pgTable(
    name,
    {
      id: bigserial({ mode: "number" }).primaryKey(),
      word: varchar({ length: 50 }).notNull().unique(),
      isActive: boolean("is_active").notNull().default(true),
      createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
      updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    },
    (t) => [check(`${name}_word_length_check`, sql`char_length(${t.word}) <= ${sql.raw(String(WORD_MAX_LENGTH))}`)],
  );

export const adjectives = wordTable("adjectives");
export const nouns = wordTable("nouns");
export const verbs = wordTable("verbs");
export const adverbs = wordTable("adverbs");

/**
 * Fixed-window rate-limit counters, one row per (scope, client key). `key` is an HMAC of the
 * normalized client address (64 hex characters), never the address itself. See lib/rate-limit.
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    scope: varchar({ length: 32 }).notNull(),
    key: varchar({ length: 64 }).notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer().notNull(),
  },
  // window_start is indexed so stale rows can be purged by age.
  (t) => [primaryKey({ columns: [t.scope, t.key] }), index("idx_rate_limits_window_start").on(t.windowStart)],
);
