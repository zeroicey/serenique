import type { Context, Next } from "hono";
import { auditService } from "@/modules/audit/audit.service";
import { clientIp } from "@/shared/ip";
import { Res } from "@/shared/response";
import { SESSION_COOKIE_NAME } from "./auth.domain";
import { authService } from "./auth.service";

// ---------------------------------------------------------------------------
// Auth middleware — the gate for every /api/* route.
// 凭证：Authorization: Bearer <AUTH_TOKEN>（CLI/移动端/脚本）或 HttpOnly 会话
// Cookie（浏览器）。放行：/api/auth/login、/api/auth/logout、签名 blob 链接
// （/api/blobs/:id/file?expires=&signature=，交给 blob handler 自行校验）。
// dev 未配置 AUTH_TOKEN 时整体跳过（本地零摩擦）。
// ---------------------------------------------------------------------------

const BLOB_FILE_ROUTE = /^\/api\/blobs\/[^/]+\/file$/;

function isSignedBlobLink(c: Context): boolean {
  const q = c.req.query();
  return BLOB_FILE_ROUTE.test(c.req.path) && Boolean(q.expires && q.signature);
}

export async function authMiddleware(c: Context, next: Next) {
  if (!authService.isAuthEnabled()) return next();
  if (c.req.path === "/api/auth/login" || c.req.path === "/api/auth/logout") {
    return next();
  }
  if (isSignedBlobLink(c)) return next();

  const header = c.req.header("Authorization");
  if (header && header.startsWith("Bearer ")) {
    const token = header.slice("Bearer ".length).trim();
    if (token && authService.authenticate(token)) return next();
    auditService.recordUnauthorized(clientIp(c));
    return Res.unauthorized("未认证或登录已过期").build(c);
  }

  const rawCookie = c.req.header("Cookie") ?? "";
  const m = rawCookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]*)`));
  const value = m?.[1];
  if (value && authService.verifySessionCookie(value)) return next();

  auditService.recordUnauthorized(clientIp(c));
  return Res.unauthorized("未认证或登录已过期").build(c);
}
