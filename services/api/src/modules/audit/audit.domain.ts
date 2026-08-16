import type { AuditEvent } from '@/modules/audit/audit.types'

// ---------------------------------------------------------------------------
// Audit domain — pure rules: default Chinese messages per event, and the
// 401 per-IP dedup state machine. No DB / IO imports, so these are
// unit-testable without a database (aligned with auth.domain's throttle).
// ---------------------------------------------------------------------------

export const UNAUTHORIZED_DEDUP_WINDOW_MS = 10 * 60_000 // 10 分钟

/** Default human-readable (Chinese) message for every registered event. */
export const EVENT_MESSAGES: Record<AuditEvent, string> = {
  'auth.login': '登录成功',
  'auth.login_failed': '登录失败',
  'auth.register': '注册 / 添加登录凭证',
  'auth.credential_delete': '删除登录凭证',
  'auth.credential_rename': '重命名登录凭证',
  'auth.logout': '退出登录',
  'auth.unauthorized': '未认证或登录已过期',
  'token.create': '创建 API 令牌',
  'token.revoke': '撤销 API 令牌',
  'blob.upload': '文件上传成功',
  'blob.delete': '文件已删除',
  'moment.delete': '闪念已删除',
  'task.delete': '任务已删除',
  'task_group.delete': '任务组已删除（含组内任务）',
  'event.delete': '事件已删除',
  'tag.delete': '标签已删除',
  'habit.delete': '习惯已删除',
}

/** Default message for an event — write points may override with a richer one. */
export function buildEventMessage(event: AuditEvent): string {
  return EVENT_MESSAGES[event]
}

// ---- 401 per-IP dedup state machine ---------------------------------------
// Same IP records at most one auth.unauthorized per window; the window resets
// after expiry. State lives in an in-memory Map at the service (process
// restart clears it — acceptable, same trade-off as the auth throttle).

export type UnauthorizedDedupState = { recordedAtMs: number }

/** True when the ip should record a new unauthorized event (no state or expired). */
export function unauthorizedShouldRecord(
  state: UnauthorizedDedupState | undefined,
  nowMs: number,
  windowMs = UNAUTHORIZED_DEDUP_WINDOW_MS,
): boolean {
  if (!state) return true
  return nowMs - state.recordedAtMs >= windowMs
}

/** Mark a fresh unauthorized record for the ip (window restarts). */
export function unauthorizedRecord(
  _state: UnauthorizedDedupState | undefined,
  nowMs: number,
): UnauthorizedDedupState {
  return { recordedAtMs: nowMs }
}

/** True when a state entry has fully expired and can be swept. */
export function unauthorizedStateExpired(
  state: UnauthorizedDedupState,
  nowMs: number,
  windowMs = UNAUTHORIZED_DEDUP_WINDOW_MS,
): boolean {
  return nowMs - state.recordedAtMs >= windowMs
}
