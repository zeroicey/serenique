CREATE TABLE "blob_attachments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"blob_id" uuid NOT NULL,
	"owner_type" text NOT NULL,
	"owner_id" text NOT NULL,
	"role" text DEFAULT 'attachment' NOT NULL,
	"display_name" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "blob_attachments" ADD CONSTRAINT "blob_attachments_blob_id_blobs_id_fk" FOREIGN KEY ("blob_id") REFERENCES "public"."blobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "blob_attachments_blob_id_idx" ON "blob_attachments" USING btree ("blob_id");--> statement-breakpoint
CREATE INDEX "blob_attachments_owner_idx" ON "blob_attachments" USING btree ("owner_type","owner_id");