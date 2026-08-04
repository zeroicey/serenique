ALTER TABLE "moments" RENAME COLUMN "content" TO "text";
--> statement-breakpoint
CREATE INDEX "blob_attachments_owner_order_idx" ON "blob_attachments" USING btree ("owner_type","owner_id","sort_order","created_at","id");
