import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/api/errors'
import { loginWithPasskey, registerWithPasskey } from './webauthn'
import { loginFinish, loginStart, registerFinish, registerStart } from './api'
import { startAuthentication, startRegistration } from '@simplewebauthn/browser'

// ceremony 编排测试：mock 掉 API 层与浏览器 WebAuthn，验证双段流程顺序与错误翻译。

vi.mock('./api', () => ({
  loginStart: vi.fn(),
  loginFinish: vi.fn(),
  registerStart: vi.fn(),
  registerFinish: vi.fn(),
}))

vi.mock('@simplewebauthn/browser', () => ({
  startAuthentication: vi.fn(),
  startRegistration: vi.fn(),
  browserSupportsWebAuthn: vi.fn(() => true),
}))

const mockedLoginStart = vi.mocked(loginStart)
const mockedLoginFinish = vi.mocked(loginFinish)
const mockedRegisterStart = vi.mocked(registerStart)
const mockedRegisterFinish = vi.mocked(registerFinish)
const mockedStartAuthentication = vi.mocked(startAuthentication)
const mockedStartRegistration = vi.mocked(startRegistration)

const authStatus = { authenticated: true, user: null }
const loginOptions = { challenge: 'ch', rpId: 'localhost', allowCredentials: [], timeout: 60000 }
const registerOptions = {
  challenge: 'ch',
  rp: { name: 'Serenique' },
  user: { id: 'u', name: 'n', displayName: 'n' },
  pubKeyCredParams: [{ type: 'public-key' as const, alg: -7 }],
  timeout: 60000,
}

/** 构造指定 name 的浏览器异常。 */
function browserError(name: string): Error {
  const e = new Error(`browser: ${name}`)
  e.name = name
  return e
}

function registrationResponse() {
  return {
    id: 'cred',
    rawId: 'cred',
    type: 'public-key' as const,
    response: { clientDataJSON: 'a', attestationObject: 'b' },
    clientExtensionResults: {},
  }
}

function authenticationResponse() {
  return {
    id: 'cred',
    rawId: 'cred',
    type: 'public-key' as const,
    response: { clientDataJSON: 'a', authenticatorData: 'b', signature: 'c' },
    clientExtensionResults: {},
  }
}

describe('webauthn ceremony', () => {
  afterEach(() => vi.clearAllMocks())

  it('login: login/start → startAuthentication → login/finish', async () => {
    mockedLoginStart.mockResolvedValue({ challengeId: 'c1', options: loginOptions })
    mockedStartAuthentication.mockResolvedValue(authenticationResponse())
    mockedLoginFinish.mockResolvedValue(authStatus)

    const result = await loginWithPasskey()

    expect(mockedLoginStart).toHaveBeenCalledTimes(1)
    expect(mockedStartAuthentication).toHaveBeenCalledWith({ optionsJSON: loginOptions })
    expect(mockedLoginFinish).toHaveBeenCalledWith({
      challengeId: 'c1',
      credential: expect.objectContaining({ id: 'cred' }),
    })
    expect(result).toEqual(authStatus)
  })

  it('register: register/start（带 setupToken）→ startRegistration → register/finish', async () => {
    mockedRegisterStart.mockResolvedValue({ challengeId: 'c2', options: registerOptions })
    mockedStartRegistration.mockResolvedValue(registrationResponse())
    mockedRegisterFinish.mockResolvedValue(authStatus)

    const result = await registerWithPasskey({ setupToken: 'tok' })

    expect(mockedRegisterStart).toHaveBeenCalledWith({ setupToken: 'tok' })
    expect(mockedStartRegistration).toHaveBeenCalledWith({ optionsJSON: registerOptions })
    expect(mockedRegisterFinish).toHaveBeenCalledWith({
      challengeId: 'c2',
      credential: expect.objectContaining({ id: 'cred' }),
    })
    expect(result).toEqual(authStatus)
  })

  it('register: 登录态添加设备时不传 setupToken', async () => {
    mockedRegisterStart.mockResolvedValue({ challengeId: 'c3', options: registerOptions })
    mockedStartRegistration.mockResolvedValue(registrationResponse())
    mockedRegisterFinish.mockResolvedValue(authStatus)

    await registerWithPasskey({})

    expect(mockedRegisterStart).toHaveBeenCalledWith({})
  })

  it('登录：NotAllowedError → 「已取消或没有可用的通行密钥」', async () => {
    mockedLoginStart.mockResolvedValue({ challengeId: 'c1', options: loginOptions })
    mockedStartAuthentication.mockRejectedValue(browserError('NotAllowedError'))
    await expect(loginWithPasskey()).rejects.toThrow('已取消或没有可用的通行密钥')
  })

  it('注册：NotSupportedError → 「当前环境不支持通行密钥（WebAuthn）」', async () => {
    mockedRegisterStart.mockResolvedValue({ challengeId: 'c2', options: registerOptions })
    mockedStartRegistration.mockRejectedValue(browserError('NotSupportedError'))
    await expect(registerWithPasskey({})).rejects.toThrow('当前环境不支持通行密钥（WebAuthn）')
  })

  it('注册：InvalidStateError → 已注册提示', async () => {
    mockedRegisterStart.mockResolvedValue({ challengeId: 'c2', options: registerOptions })
    mockedStartRegistration.mockRejectedValue(browserError('InvalidStateError'))
    await expect(registerWithPasskey({})).rejects.toThrow('此设备已经注册过通行密钥')
  })

  it('服务端 ApiError 原样透传（如 403 引导注册令牌不正确）', async () => {
    mockedRegisterStart.mockRejectedValue(new ApiError('引导注册令牌不正确', 403))
    await expect(registerWithPasskey({ setupToken: 'wrong' })).rejects.toThrow('引导注册令牌不正确')
  })

  it('网络失败（fetch TypeError）→ 「服务暂时不可用，请稍后再试」', async () => {
    mockedLoginStart.mockRejectedValue(new TypeError('fetch failed'))
    await expect(loginWithPasskey()).rejects.toThrow('服务暂时不可用，请稍后再试')
  })

  it('请求超时（TimeoutError）→ 「服务暂时不可用，请稍后再试」', async () => {
    const timeoutError = new Error('Request timed out')
    timeoutError.name = 'TimeoutError'
    mockedRegisterStart.mockRejectedValue(timeoutError)
    await expect(registerWithPasskey({ setupToken: 'tok' })).rejects.toThrow(
      '服务暂时不可用，请稍后再试',
    )
  })

  it('SecurityError → 来源不受信任提示', async () => {
    mockedLoginStart.mockResolvedValue({ challengeId: 'c1', options: loginOptions })
    mockedStartAuthentication.mockRejectedValue(browserError('SecurityError'))
    await expect(loginWithPasskey()).rejects.toThrow('当前来源不受信任')
  })

  it('未知浏览器异常 → 通用失败文案', async () => {
    mockedLoginStart.mockResolvedValue({ challengeId: 'c1', options: loginOptions })
    mockedStartAuthentication.mockRejectedValue(browserError('UnknownError'))
    await expect(loginWithPasskey()).rejects.toThrow('通行密钥验证失败，请重试')
  })
})
