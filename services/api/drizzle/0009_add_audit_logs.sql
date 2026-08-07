CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event" text NOT NULL,
	"message" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"source" text,
	"ip" text,
	"detail" jsonb,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at_desc" ON "audit_logs" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_is_read_created_at_desc" ON "audit_logs" USING btree ("is_read","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_audit_logs_event_created_at_desc" ON "audit_logs" USING btree ("event","created_at" DESC NULLS LAST);