CREATE TABLE "task_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "chk_tasks_status" CHECK ("tasks"."status" IN ('todo', 'done', 'abandon'))
);
--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_group_id_task_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."task_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_task_groups_updated_at_desc" ON "task_groups" USING btree ("updated_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_tasks_created_at_desc" ON "tasks" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_tasks_status_created_at_desc" ON "tasks" USING btree ("status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_tasks_group_status_created_at_desc" ON "tasks" USING btree ("group_id","status","created_at" DESC NULLS LAST);