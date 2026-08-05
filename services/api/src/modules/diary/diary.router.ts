import { Hono } from "hono";
import { diaryHandler } from "@/modules/diary/diary.handler";

// ---------------------------------------------------------------------------
// Diary router — RESTful routes mounted under /api/diaries
// ---------------------------------------------------------------------------

export const diaryRouter = new Hono()
  .get("/diaries", diaryHandler.list)
  .post("/diaries", diaryHandler.create)
  .get("/diaries/by-date/:date", diaryHandler.getByDate)
  .get("/diaries/:id", diaryHandler.get)
  .put("/diaries/:id", diaryHandler.update)
  .delete("/diaries/:id", diaryHandler.delete);
