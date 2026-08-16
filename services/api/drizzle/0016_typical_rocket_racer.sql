CREATE TABLE "habit_daily" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"habit_id" uuid NOT NULL,
	"date" text NOT NULL,
	"status" text,
	"count" integer DEFAULT 0 NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_habit_daily_status" CHECK ("habit_daily"."status" IS NULL OR "habit_daily"."status" IN ('done', 'not_done')),
	CONSTRAINT "chk_habit_daily_count" CHECK ("habit_daily"."count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"countable" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_habits_kind" CHECK ("habits"."kind" IN ('good', 'bad'))
);
--> statement-breakpoint
ALTER TABLE "habit_daily" ADD CONSTRAINT "habit_daily_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_habit_daily_habit_date" ON "habit_daily" USING btree ("habit_id","date");--> statement-breakpoint
CREATE INDEX "idx_habit_daily_date" ON "habit_daily" USING btree ("date");--> statement-breakpoint
CREATE INDEX "idx_habits_sort_order" ON "habits" USING btree ("sort_order");