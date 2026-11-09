import { sql } from "drizzle-orm";
import { bigint, bigserial, boolean, check, index, pgTable, text, timestamp, varchar } from "drizzle-orm/pg-core";

/** Column length of url_mappings.short_code; issuing regenerates phrases longer than this. */
export const SHORT_CODE_MAX_LENGTH = 255;

/**
 * Longest word allowed in the word tables. The longest pattern (C) is 5 words + "with" + 5 hyphens,
 * so 5w + 9 <= SHORT_CODE_MAX_LENGTH gives w <= 49 and every phrase fits in short_code.
 */
export const WORD_MAX_LENGTH = Math.floor((SHORT_CODE_MAX_LENGTH - "with".length - 5) / 5);

export const urlMappings = pgTable("url_mappings", {
  id: bigserial({ mode: "number" }).primaryKey(),
  // UNIQUE already creates an index; no separate index on short_code.
  shortCode: varchar("short_code", { length: SHORT_CODE_MAX_LENGTH }).notNull().unique(),
  originalUrl: text("original_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  accessCount: bigint("access_count", { mode: "number" }).notNull().default(0),
});

export const accessLog = pgTable(
  "access_log",
  {
    id: bigserial({ mode: "number" }).primaryKey(),
    urlMappingId: bigint("url_mapping_id", { mode: "number" })
      .notNull()
      .references(() => urlMappings.id, { onDelete: "cascade" }),
    accessedAt: timestamp("accessed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("idx_access_log_url_mapping_id").on(t.urlMappingId), index("idx_access_log_accessed_at").on(t.accessedAt)],
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
