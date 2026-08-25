import { Hono } from 'hono'
import { authHandler } from './auth.handler'

export const authRouter = new Hono()
  // ---- OIDC 登录（Pocket ID 授权码 + PKCE）---------------------------------
  .get('/auth/oidc/url', authHandler.oidcAuthorize)
  .post('/auth/oidc/callback', authHandler.oidcCallback)
  // ---- 会话状态 -------------------------------------------------------------
  .post('/auth/logout', authHandler.logout)
  .get('/auth/me', authHandler.me)
  // ---- 个人信息 --------------------------------------------------------------
  .get('/users/me', authHandler.getProfile)
  .put('/users/me', authHandler.updateProfile)
