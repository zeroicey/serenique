import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from './login-page'
import { useLogin, useRegister, useRegisterGate, type RegisterGateState } from '../queries'

// mock 掉 queries（登录/注册 mutation）与 webauthn（浏览器能力探测），
// 页面只测门禁探测驱动的 UI 分支与交互。
vi.mock('../queries', () => ({
  useLogin: vi.fn(),
  useRegister: vi.fn(),
  useRegisterGate: vi.fn(),
}))

vi.mock('../webauthn', () => ({
  browserSupportsWebAuthn: vi.fn(() => true),
}))

const mockedUseLogin = vi.mocked(useLogin)
const mockedUseRegister = vi.mocked(useRegister)
const mockedUseRegisterGate = vi.mocked(useRegisterGate)

const loginMutateAsync = vi.fn().mockResolvedValue({ authenticated: true, user: null })
const registerMutate = vi.fn()

function renderPage(
  gateState?: RegisterGateState,
  registerOverride?: Partial<ReturnType<typeof useRegister>>,
) {
  mockedUseLogin.mockReturnValue({
    mutateAsync: loginMutateAsync,
    isPending: false,
  } as unknown as ReturnType<typeof useLogin>)
  mockedUseRegister.mockReturnValue({
    mutate: registerMutate,
    isPending: false,
    error: null,
    ...registerOverride,
  } as unknown as ReturnType<typeof useRegister>)
  mockedUseRegisterGate.mockReturnValue({
    data: gateState,
  } as unknown as ReturnType<typeof useRegisterGate>)
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  beforeEach(() => {
    loginMutateAsync.mockClear()
    registerMutate.mockClear()
  })

  it('已注册状态：只渲染登录按钮，不显示注册表单', () => {
    renderPage({ state: 'registered' })
    expect(screen.getByRole('button', { name: '使用通行密钥登录' })).toBeInTheDocument()
    expect(screen.queryByLabelText('引导令牌')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '首次使用？注册新账户' })).not.toBeInTheDocument()
  })

  it('点击登录触发 passkey 登录 mutation', async () => {
    const user = userEvent.setup()
    renderPage({ state: 'registered' })
    await user.click(screen.getByRole('button', { name: '使用通行密钥登录' }))
    expect(loginMutateAsync).toHaveBeenCalledTimes(1)
  })

  it('首次注册状态：直接展示注册表单（引导令牌 + 可选个人信息）', () => {
    renderPage({ state: 'first-time' })
    expect(screen.getByLabelText('引导令牌')).toBeInTheDocument()
    expect(screen.getByLabelText('姓名（可选）')).toBeInTheDocument()
    expect(screen.getByLabelText('邮箱（可选）')).toBeInTheDocument()
    expect(screen.getByLabelText('生日（可选）')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '注册' })).toBeInTheDocument()
    // 可从注册视图切回登录视图
    expect(screen.getByRole('button', { name: '已有通行密钥？去登录' })).toBeInTheDocument()
  })

  it('提交注册表单：携带 setupToken 与可选个人信息调用注册 mutation', async () => {
    const user = userEvent.setup()
    renderPage({ state: 'first-time' })
    await user.type(screen.getByLabelText('引导令牌'), 'setup-tok-123')
    await user.type(screen.getByLabelText('姓名（可选）'), '测试用户')
    await user.click(screen.getByRole('button', { name: '注册' }))

    expect(registerMutate).toHaveBeenCalledTimes(1)
    const [payload] = registerMutate.mock.calls[0]
    expect(payload).toEqual({ setupToken: 'setup-tok-123', userInfo: { name: '测试用户' } })
  })

  it('不填可选信息时 userInfo 各字段为 undefined（发往服务端时被剔除）', async () => {
    const user = userEvent.setup()
    renderPage({ state: 'first-time' })
    await user.type(screen.getByLabelText('引导令牌'), 'setup-tok-123')
    await user.click(screen.getByRole('button', { name: '注册' }))

    const [payload] = registerMutate.mock.calls[0]
    expect(payload.setupToken).toBe('setup-tok-123')
    expect(payload.userInfo.name).toBeUndefined()
    expect(payload.userInfo.email).toBeUndefined()
    expect(payload.userInfo.birthday).toBeUndefined()
  })

  it('注册失败（如引导令牌不正确）内联展示错误文案', () => {
    renderPage({ state: 'first-time' }, { error: new Error('引导注册令牌不正确') })
    expect(screen.getByRole('alert')).toHaveTextContent('引导注册令牌不正确')
  })

  it('无法判断状态（网络异常）：登录按钮 + 注册入口 + 提示信息', () => {
    renderPage({ state: 'unavailable', message: '无法连接服务器，请检查网络' })
    expect(screen.getByRole('button', { name: '使用通行密钥登录' })).toBeInTheDocument()
    expect(screen.getByText('无法连接服务器，请检查网络')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '首次使用？注册新账户' })).toBeInTheDocument()
  })
})
