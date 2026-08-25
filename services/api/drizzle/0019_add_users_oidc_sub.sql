ALTER TABLE "users" ADD COLUMN "oidc_sub" text;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_oidc_sub_unique" UNIQUE("oidc_sub");