import { Hono } from 'hono'
import { aiMemoryHandler } from '@/modules/ai-memory/ai-memory.handler'

// ---------------------------------------------------------------------------
// AI memory router — 用户画像（L2）读写，挂在 /api 下（app.ts 挂载，
// authMiddleware 已在 /api/* 生效）。
//   GET /ai/memory   → 当前用户画像（无记录返回 { content: '' }）
//   PUT /ai/memory   → upsert 用户画像（body { content }，≤2048 字符）
// ---------------------------------------------------------------------------

export const aiMemoryRouter = new Hono()
  .get('/ai/memory', aiMemoryHandler.get)
  .put('/ai/memory', aiMemoryHandler.put)
