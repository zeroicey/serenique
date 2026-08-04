ALTER TABLE "diaries" DROP COLUMN "mood";
ALTER TABLE "diaries" DROP COLUMN "weather";
ALTER TABLE "diaries" RENAME COLUMN "title" TO "diary_date";
ALTER TABLE "diaries" ADD CONSTRAINT "diaries_diary_date_unique" UNIQUE ("diary_date");
