import type { Context } from "hono";
import { env } from "@/env";
import { fireAuditRecord } from "@/modules/audit/audit.service";
import {
  getAuthVars,
  requireSessionUser,
} from "@/modules/auth/auth.middleware";
import {
  buildSessionCookie,
  clearSessionCookie,
} from "@/modules/auth/auth.domain";
import { authService } from "@/modules/auth/auth.service";
import {
  LoginFinishSchema,
  RegisterFinishSchema,
  RegisterStartSchema,
  UpdateUserProfileSchema,
} from "@/modules/auth/auth.types";
import { handleError, uuidParam } from "@/shared/handler";
import { clientIp } from "@/shared/ip";
import { Res } from "@/shared/response";
import { AppError, ErrorCode } from "@/shared/errors";

// ---------------------------------------------------------------------------
// Auth handlers — parse request → call service → build response.
// Set-Cookie 统一在这里拼装（crossSite/secure 由 NODE_ENV 决定）。
// ---------------------------------------------------------------------------

function resolveExpectedOrigin(c: Context): string {
  const origin = c.req.header("Origin");
  if (origin && !env.WEBAUTHN_ORIGINS.includes(origin)) {
    throw new AppError(ErrorCode.FORBIDDEN, "请求来源不受信任", 403);
  }
  return origin ?? env.WEBAUTHN_ORIGINS[0];
}

function buildSetCookie(c: Context, userId: string): void {
  const crossSite = env.NODE_ENV === "production";
  const secure = env.NODE_ENV !== "development";
  c.header(
    "Set-Cookie",
    buildSessionCookie(
      authService.createSessionCookie(userId),
      authService.sessionTtlSeconds(),
      crossSite,
      secure,
    ),
  );
}

function clearCookie(c: Context): void {
  const crossSite = env.NODE_ENV === "production";
  const secure = env.NODE_ENV !== "development";
  c.header("Set-Cookie", clearSessionCookie(crossSite, secure));
}

export const authHandler = {
  // ---- 注册（首次引导 / 登录态添加新设备）----------------------------------

  async registerStart(c: Context) {
    try {
      const body = RegisterStartSchema.parse(await c.req.json());
      const sessionUserId = getAuthVars(c).userId;
      const result = await authService.registerStart({
        ...body,
        sessionUserId,
      });
      return Res.ok("获取注册参数成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },

  async registerFinish(c: Context) {
    try {
      const body = RegisterFinishSchema.parse(await c.req.json());
      const result = await authService.registerFinish({
        ...body,
        origin: resolveExpectedOrigin(c),
        ip: clientIp(c),
      });
      // 注册成功即自动登录（发会话 cookie）。数据载荷固定 { authenticated, user }，
      // 不暴露引导/加设备语义（决策⑨）。
      buildSetCookie(c, result.user.id);
      return Res.ok(
        result.mode === "first-time" ? "注册成功" : "登录凭证添加成功",
        { authenticated: true, user: result.user },
      ).build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },

  // ---- 登录 ----------------------------------------------------------------

  async loginStart(c: Context) {
    try {
      const result = await authService.loginStart();
      return Res.ok("获取登录参数成功", result).build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },

  async loginFinish(c: Context) {
    const ip = clientIp(c);
    try {
      const body = LoginFinishSchema.parse(await c.req.json());
      const result = await authService.loginFinish({
        ...body,
        origin: resolveExpectedOrigin(c),
        ip,
      });
      if (result.status === "throttled") {
        return Res.error("尝试过于频繁，请稍后再试").status(429).build(c);
      }
      if (result.status === "rejected") {
        return Res.unauthorized("登录验证失败").build(c);
      }
      buildSetCookie(c, result.user.id);
      return Res.ok("登录成功", { authenticated: true, user: result.user }).build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },

  async logout(c: Context) {
    clearCookie(c);
    fireAuditRecord({
      event: "auth.logout",
      message: "退出登录",
      level: "info",
      ip: clientIp(c),
    });
    return Res.ok("已退出登录", { authenticated: false }).build(c);
  },

  /**
   * 会话状态 + 用户信息。认证禁用/未登录 → authenticated:false；
   * 令牌身份（已通过中间件认证）→ authenticated:true + 单用户资料（未注册时为 null）。
   */
  async me(c: Context) {
    try {
      const { userId, authSource } = getAuthVars(c);
      if (!userId && authSource !== "token") {
        return Res.ok("查询成功", { authenticated: false, user: null }).build(c);
      }
      const user = userId
        ? await authService.getProfile(userId)
        : await authService.getFirstUser();
      return Res.ok("查询成功", { authenticated: true, user }).build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },

  // ---- 凭证管理（需登录会话）------------------------------------------------

  async listCredentials(c: Context) {
    try {
      const userId = requireSessionUser(c);
      const items = await authService.listCredentials(userId);
      return Res.ok("查询成功", { items }).build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },

  async deleteCredential(c: Context) {
    try {
      const userId = requireSessionUser(c);
      await authService.deleteCredential({
        userId,
        credentialId: uuidParam(c, "id"),
      });
      return Res.noContent("凭证删除成功").build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },

  // ---- 个人信息（需登录会话）------------------------------------------------

  async getProfile(c: Context) {
    try {
      const userId = requireSessionUser(c);
      const user = await authService.getProfile(userId);
      return Res.ok("查询成功", user).build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },

  async updateProfile(c: Context) {
    try {
      const userId = requireSessionUser(c);
      const body = UpdateUserProfileSchema.parse(await c.req.json());
      const user = await authService.updateProfile(userId, body);
      return Res.ok("个人信息已更新", user).build(c);
    } catch (e) {
      return handleError(e, c, "auth");
    }
  },
};
