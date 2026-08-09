import { Hono } from "hono";
import { authHandler } from "./auth.handler";

export const authRouter = new Hono()
  // ---- Passkey 注册 / 登录 ceremony ----
  .post("/auth/register/start", authHandler.registerStart)
  .post("/auth/register/finish", authHandler.registerFinish)
  .post("/auth/login/start", authHandler.loginStart)
  .post("/auth/login/finish", authHandler.loginFinish)
  .post("/auth/logout", authHandler.logout)
  // ---- 会话状态 / 凭证管理 ----
  .get("/auth/me", authHandler.me)
  .get("/auth/credentials", authHandler.listCredentials)
  .patch("/auth/credentials/:id", authHandler.renameCredential)
  .delete("/auth/credentials/:id", authHandler.deleteCredential)
  // ---- 个人信息 ----
  .get("/users/me", authHandler.getProfile)
  .put("/users/me", authHandler.updateProfile);
