DROP INDEX "idx_access_log_url_mapping_id";--> statement-breakpoint
DROP INDEX "idx_access_log_accessed_at";--> statement-breakpoint
CREATE INDEX "idx_access_log_url_mapping_id_accessed_at" ON "access_log" USING btree ("url_mapping_id","accessed_at");