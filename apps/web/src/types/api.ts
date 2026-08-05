// 跨 feature 共享的 API 类型。
// 请求/响应类型按 feature 定义在 features/*/api.ts；这里只放真正跨 feature 的类型。

/** API 统一响应包（解包前的形状）。 */
export interface ApiEnvelope<T> {
  success: boolean
  message: string
  data?: T
  error?: unknown
}

/** 列表端点形状（与 API list 约定一致）。 */
export interface Paged<T> {
  items: T[]
  total: number
}
