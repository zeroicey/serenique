import { z } from 'zod'

// ---------------------------------------------------------------------------
// AI memory module — 用户画像（L2）请求/响应类型。
// content = 用户写给 AI 的自我介绍/偏好/背景（≤2KB）。
// ---------------------------------------------------------------------------

/** 用户画像正文：trim 后 0~2048 字符（允许清空 = 不注入该层）。 */
export const AiMemorySchema = z.object({
  content: z.string().trim().max(2048),
})

export type PutAiMemoryInput = z.input<typeof AiMemorySchema>

// ---- Entry types (response layer) — 时间为 ISO 字符串 ----------------------

export type AiMemoryEntry = {
  id: number
  content: string
  updatedAt: string
}
