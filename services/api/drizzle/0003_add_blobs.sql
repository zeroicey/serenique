CREATE TABLE "blobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_name" text NOT NULL,
	"storage_path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"checksum" text NOT NULL,
	"metadata" jsonb DEFAULT '{}' NOT NULL,
	"width" integer,
	"height" integer,
	"duration" real,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "blobs_checksum_unique" UNIQUE("checksum")
);
