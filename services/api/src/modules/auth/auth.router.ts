import { Hono } from "hono";
import { authHandler } from "./auth.handler";

export const authRouter = new Hono()
  .post("/auth/login", authHandler.login)
  .post("/auth/logout", authHandler.logout)
  .get("/auth/me", authHandler.me);
