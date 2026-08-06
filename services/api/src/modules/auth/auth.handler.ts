import type { Context } from "hono";
import { env } from "@/env";
import { handleError } from "@/shared/handler";
import { Res } from "@/shared/response";
import {
  buildSessionCookie,
  clearSessionCookie,
} from "./auth.domain";
import { authService } from "./auth.service";
import { LoginSchema } from "./auth.types";

/** 尽量取真实客户端 IP（先 Cloudflare，再转发链，最后兜底）。 */
function clientIp(c: Context): string {
  return (
    c.req.header("cf-connecting-ip") ??
    c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export const authHandler = {
  async login(c: Context) {
    try {
      const body = LoginSchema.parse(await c.req.json());
      const result = await authService.login(clientIp(c), body.token);
      if (result === "throttled") {
        return Res.error("尝试过于频繁，请稍后再试").status(429).build(c);
      }
      if (result === "rejected") {
        return Res.error("认证失败，密钥不正确").status(401).build(c);
      }
      // Auth 未启用（dev、未配置 AUTH_TOKEN）时返回 200 已认证但不发会话 cookie：
      // createSessionCookie() 在 env.AUTH_TOKEN === undefined 时会因 createHmac
      // 抛错 → 500。启用 auth 时走下方正常发 cookie 流程。
      if (authService.isAuthEnabled()) {
        const cookie = authService.createSessionCookie();
        const crossSite = env.NODE_ENV === "production";
        const secure = env.NODE_ENV !== "development";
        c.header(
          "Set-Cookie",
          buildSessionCookie(cookie, authService.sessionTtlSeconds(), crossSite, secure),
        );
      }
      return Res.ok("登录成功", { authenticated: true }).build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },

  async logout(c: Context) {
    const crossSite = env.NODE_ENV === "production";
    const secure = env.NODE_ENV !== "development";
    c.header("Set-Cookie", clearSessionCookie(crossSite, secure));
    return Res.ok("已退出登录", { authenticated: false }).build(c);
  },

  /** 能走到这里即已通过中间件认证，恒为 true。 */
  async me(c: Context) {
    return Res.ok("查询成功", { authenticated: true }).build(c);
  },
};
