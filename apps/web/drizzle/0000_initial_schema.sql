CREATE TABLE "access_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"url_mapping_id" bigint NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "adjectives" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"word" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adjectives_word_unique" UNIQUE("word")
);
--> statement-breakpoint
CREATE TABLE "adverbs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"word" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "adverbs_word_unique" UNIQUE("word")
);
--> statement-breakpoint
CREATE TABLE "nouns" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"word" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nouns_word_unique" UNIQUE("word")
);
--> statement-breakpoint
CREATE TABLE "url_mappings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"short_code" varchar(255) NOT NULL,
	"original_url" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone,
	"access_count" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "url_mappings_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "verbs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"word" varchar(50) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verbs_word_unique" UNIQUE("word")
);
--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_url_mapping_id_url_mappings_id_fk" FOREIGN KEY ("url_mapping_id") REFERENCES "public"."url_mappings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_access_log_url_mapping_id" ON "access_log" USING btree ("url_mapping_id");--> statement-breakpoint
CREATE INDEX "idx_access_log_accessed_at" ON "access_log" USING btree ("accessed_at");