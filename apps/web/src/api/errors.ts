// 来自 API 响应的错误（unwrap 抛出）。message 面向用户，为 API 返回的中文文案。
export class ApiError extends Error {
  readonly status: number
  readonly detail: unknown

  constructor(message: string, status: number, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

// 规整任意错误为可展示的 Error：ApiError 保留原文案，其余归为通用错误。
export function toDisplayError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error('发生未知错误')
}
