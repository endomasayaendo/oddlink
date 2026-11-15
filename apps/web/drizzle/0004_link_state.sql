CREATE TYPE "public"."link_actor" AS ENUM('owner', 'operator', 'automated');--> statement-breakpoint
ALTER TABLE "access_log" DROP CONSTRAINT "access_log_url_mapping_id_url_mappings_id_fk";
--> statement-breakpoint
ALTER TABLE "url_mappings" ALTER COLUMN "original_url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "url_mappings" ADD COLUMN "disabled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "url_mappings" ADD COLUMN "disabled_by" "link_actor";--> statement-breakpoint
ALTER TABLE "url_mappings" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "url_mappings" ADD COLUMN "deleted_by" "link_actor";--> statement-breakpoint
ALTER TABLE "access_log" ADD CONSTRAINT "access_log_url_mapping_id_url_mappings_id_fk" FOREIGN KEY ("url_mapping_id") REFERENCES "public"."url_mappings"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "url_mappings" ADD CONSTRAINT "disabled_pair" CHECK (("url_mappings"."disabled_at" IS NULL) = ("url_mappings"."disabled_by" IS NULL));--> statement-breakpoint
ALTER TABLE "url_mappings" ADD CONSTRAINT "deleted_pair" CHECK (("url_mappings"."deleted_at" IS NULL) = ("url_mappings"."deleted_by" IS NULL));--> statement-breakpoint
ALTER TABLE "url_mappings" ADD CONSTRAINT "deleted_by_not_automated" CHECK ("url_mappings"."deleted_by" <> 'automated');--> statement-breakpoint
ALTER TABLE "url_mappings" ADD CONSTRAINT "url_unless_deleted" CHECK ("url_mappings"."deleted_at" IS NOT NULL OR "url_mappings"."original_url" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "url_mappings" ADD CONSTRAINT "tombstone_is_empty" CHECK ("url_mappings"."deleted_at" IS NULL OR "url_mappings"."original_url" IS NULL);