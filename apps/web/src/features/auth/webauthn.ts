import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser'
import { ApiError, toDisplayError } from '@/api/errors'
import { type AuthStatus, loginFinish, loginStart, registerFinish, registerStart } from './api'

// WebAuthn ceremony 客户端：API start 段 → 浏览器通行密钥弹窗 → API finish 段。
// 全部走 TanStack Query mutations；浏览器/服务端错误统一翻译为中文文案。

export { browserSupportsWebAuthn }

/** 把浏览器 WebAuthn / 网络异常翻译成中文提示；ApiError（服务端响应）原样透传。 */
function toChineseError(error: unknown, action: '登录' | '注册'): Error {
  if (error instanceof ApiError) return error
  const e = toDisplayError(error)
  // 网络层：fetch 失败（TypeError）或 ky 超时（TimeoutError）→ 后端不可达。
  if (e instanceof TypeError || e.name === 'TimeoutError') {
    return new Error('服务暂时不可用，请稍后再试')
  }
  switch (e.name) {
    case 'NotAllowedError':
      // 用户取消 / 没有匹配的凭证（浏览器不区分这两种情况）。
      return new Error(action === '登录' ? '已取消或没有可用的通行密钥' : '已取消注册')
    case 'NotSupportedError':
      return new Error('当前环境不支持通行密钥（WebAuthn）')
    case 'SecurityError':
      return new Error('当前来源不受信任，无法使用通行密钥（需 HTTPS 或 localhost）')
    case 'InvalidStateError':
      return new Error('此设备已经注册过通行密钥')
    case 'AbortError':
      return new Error('操作已中止')
    default:
      return new Error(action === '登录' ? '通行密钥验证失败，请重试' : '通行密钥注册失败，请重试')
  }
}

/** 登录：login/start → 系统 Passkey 弹窗 → login/finish（成功即发会话 Cookie）。 */
export async function loginWithPasskey(): Promise<AuthStatus> {
  try {
    const start = await loginStart()
    const credential = await startAuthentication({ optionsJSON: start.options })
    return await loginFinish({ challengeId: start.challengeId, credential })
  } catch (e) {
    throw toChineseError(e, '登录')
  }
}

/**
 * 注册（决策⑨：引导期 /setup 页带 setupToken；登录态添加设备不带）。
 * register/start → 系统 Passkey 弹窗 → register/finish（成功即自动登录）。
 */
export async function registerWithPasskey(input: { setupToken?: string }): Promise<AuthStatus> {
  try {
    const start = await registerStart(input)
    const credential = await startRegistration({ optionsJSON: start.options })
    return await registerFinish({ challengeId: start.challengeId, credential })
  } catch (e) {
    throw toChineseError(e, '注册')
  }
}
