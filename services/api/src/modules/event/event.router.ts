import { Hono } from "hono";
import { eventHandler } from "@/modules/event/event.handler";

// ---------------------------------------------------------------------------
// Event router — RESTful routes mounted under /api/events.
// List is a time-range query (?from=&to=), matching the reference API.
// ---------------------------------------------------------------------------

export const eventRouter = new Hono()
  .get("/events", eventHandler.list)
  .post("/events", eventHandler.create)
  .get("/events/:id", eventHandler.get)
  .put("/events/:id", eventHandler.update)
  .delete("/events/:id", eventHandler.delete);
