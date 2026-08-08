ALTER TABLE "tasks" ADD COLUMN "due_date" text;--> statement-breakpoint
CREATE INDEX "idx_tasks_due_date_status" ON "tasks" USING btree ("due_date","status");--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "chk_tasks_due_date_format" CHECK ("tasks"."due_date" IS NULL OR "tasks"."due_date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');