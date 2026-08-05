import type { ApiEnvelope } from '@/types/api'
import { ApiError } from './errors'

// 解包统一响应：{ success, message, data?, error? } → 成功返回 data，失败抛 ApiError。
export async function unwrap<T>(response: Response): Promise<T> {
  const body = (await response.json()) as ApiEnvelope<T>
  if (!body.success) {
    throw new ApiError(body.message, response.status, body.error)
  }
  return body.data as T
}
