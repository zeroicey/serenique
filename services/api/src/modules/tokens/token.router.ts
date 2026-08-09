import { Hono } from "hono";
import { tokenHandler } from "./token.handler";

export const tokenRouter = new Hono()
  .post("/tokens", tokenHandler.create)
  .get("/tokens", tokenHandler.list)
  .delete("/tokens/:id", tokenHandler.revoke);
