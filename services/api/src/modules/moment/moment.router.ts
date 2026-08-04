import { Hono } from "hono";
import { momentHandler } from "@/modules/moment/moment.handler";

// ---------------------------------------------------------------------------
// Moment router — RESTful routes mounted under /api/moments
// ---------------------------------------------------------------------------

export const momentRouter = new Hono()
  .get("/moments", momentHandler.list)
  .post("/moments", momentHandler.create)
  .delete("/moments/:id", momentHandler.delete);
