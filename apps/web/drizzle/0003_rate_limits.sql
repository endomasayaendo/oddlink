CREATE TABLE "rate_limits" (
	"scope" varchar(32) NOT NULL,
	"key" varchar(64) NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_scope_key_pk" PRIMARY KEY("scope","key")
);
--> statement-breakpoint
CREATE INDEX "idx_rate_limits_window_start" ON "rate_limits" USING btree ("window_start");