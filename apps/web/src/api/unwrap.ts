import type { ApiEnvelope } from '@/types/api'
import { ApiError } from './errors'

// 解包统一响应：{ success, message, data?, error? } → 成功返回 data，失败抛 ApiError。
// 非 2xx 同样走这里（client 全局 throwHttpErrors:false）；非 JSON 响应（网关 502 等）
// 统一翻译为中文文案，避免把 JSON 解析异常泄漏给调用方。
export async function unwrap<T>(response: Response): Promise<T> {
  let body: ApiEnvelope<T>
  try {
    body = (await response.json()) as ApiEnvelope<T>
  } catch {
    throw new ApiError(response.ok ? '响应解析失败' : '服务暂时不可用，请稍后再试', response.status)
  }
  if (!body.success) {
    throw new ApiError(body.message, response.status, body.error)
  }
  return body.data as T
}
