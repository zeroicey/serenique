import { Hono } from 'hono'
import { locationHandler } from '@/modules/location/location.handler'

// ---------------------------------------------------------------------------
// Location router — AMAP Web 服务代理，挂载于 /api/location。
// config：AMAP_KEY 是否已配置；nearby：附近位置；search：关键字搜索。
// ---------------------------------------------------------------------------

export const locationRouter = new Hono()
  .get('/location/config', locationHandler.config)
  .get('/location/nearby', locationHandler.nearby)
  .get('/location/search', locationHandler.search)
