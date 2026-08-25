import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogout, useProfile, useUpdateProfile } from '@/features/auth/queries'
import {
  useAiMemory,
  useCreateToken,
  useRevokeToken,
  useTokens,
  useUpdateAiMemory,
} from '../queries'
import SettingsPage from './settings-page'

const { setTheme } = vi.hoisted(() => ({ setTheme: vi.fn() }))

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme }),
}))

// mock 掉设置页用到的所有数据 hooks，页面只测各 tab 的核心交互。
// 登录凭证管理已随 Passkey 退役（2026-08-26 OIDC 迁移），不再有凭证 tab。
vi.mock('@/features/auth/queries', () => ({
  useProfile: vi.fn(),
  useUpdateProfile: vi.fn(),
  useLogout: vi.fn(),
}))

vi.mock('../queries', () => ({
  useTokens: vi.fn(),
  useCreateToken: vi.fn(),
  useRevokeToken: vi.fn(),
  useAiMemory: vi.fn(),
  useUpdateAiMemory: vi.fn(),
}))

const mockedUseProfile = vi.mocked(useProfile)
const mockedUseUpdateProfile = vi.mocked(useUpdateProfile)
const mockedUseLogout = vi.mocked(useLogout)
const mockedUseTokens = vi.mocked(useTokens)
const mockedUseCreateToken = vi.mocked(useCreateToken)
const mockedUseRevokeToken = vi.mocked(useRevokeToken)
const mockedUseAiMemory = vi.mocked(useAiMemory)
const mockedUseUpdateAiMemory = vi.mocked(useUpdateAiMemory)

const profile = {
  id: 'u1',
  name: '测试用户',
  email: 't@example.com',
  birthday: null,
  createdAt: '2026-08-09T00:00:00Z',
  updatedAt: '2026-08-09T00:00:00Z',
}

const updateProfileMutate = vi.fn()
const updateMemoryMutate = vi.fn()
const logoutMutate = vi.fn()
const revokeTokenMutate = vi.fn()
const createTokenMutate = vi.fn()

function mockHooks(overrides: { tokens?: unknown[]; memory?: { content: string } | null } = {}) {
  mockedUseProfile.mockReturnValue({
    data: profile,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useProfile>)
  mockedUseUpdateProfile.mockReturnValue({
    mutate: updateProfileMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateProfile>)
  mockedUseLogout.mockReturnValue({
    mutate: logoutMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useLogout>)
  mockedUseTokens.mockReturnValue({
    data: overrides.tokens ?? [],
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTokens>)
  mockedUseCreateToken.mockReturnValue({
    mutate: createTokenMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useCreateToken>)
  mockedUseRevokeToken.mockReturnValue({
    mutate: revokeTokenMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useRevokeToken>)
  mockedUseAiMemory.mockReturnValue({
    data: overrides.memory ?? null,
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useAiMemory>)
  mockedUseUpdateAiMemory.mockReturnValue({
    mutate: updateMemoryMutate,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateAiMemory>)
}

const token = {
  id: 't1',
  name: 'macbook',
  prefix: 'abc12345',
  lastUsedAt: null,
  revokedAt: null,
  createdAt: '2026-08-09T00:00:00Z',
}

const memory = {
  id: 1,
  content: '',
  updatedAt: '2026-08-19T00:00:00Z',
}

describe('SettingsPage', () => {
  beforeEach(() => {
    updateProfileMutate.mockClear()
    logoutMutate.mockClear()
    setTheme.mockClear()
    revokeTokenMutate.mockClear()
    createTokenMutate.mockClear()
    updateMemoryMutate.mockClear()
    mockHooks()
  })

  it('tab 面只有四个：无「登录凭证」入口（Passkey 已退役）', () => {
    render(<SettingsPage />)
    expect(screen.queryByRole('button', { name: '登录凭证' })).not.toBeInTheDocument()
    for (const name of ['个人信息', 'AI 记忆', 'API 令牌', '通用']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('默认个人信息 tab：表单回填资料，保存提交 PUT', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)
    expect(screen.getByLabelText('姓名')).toHaveValue('测试用户')
    expect(screen.getByLabelText('邮箱')).toHaveValue('t@example.com')

    await user.clear(screen.getByLabelText('姓名'))
    await user.type(screen.getByLabelText('姓名'), '新名字')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(updateProfileMutate).toHaveBeenCalledWith({
      name: '新名字',
      email: 't@example.com',
      birthday: '',
    })
  })

  it('令牌 tab：列出令牌（prefix 展示 + 已撤销标记）', () => {
    mockHooks({
      tokens: [
        token,
        {
          ...token,
          id: 't2',
          name: 'server',
          prefix: 'zzzz9999',
          revokedAt: '2026-08-09T03:00:00Z',
        },
      ],
    })
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'API 令牌' }))
    expect(screen.getByText('macbook')).toBeInTheDocument()
    expect(screen.getByText('serenique_abc12345…')).toBeInTheDocument()
    expect(screen.getByText('已撤销')).toBeInTheDocument()
  })

  it('令牌 tab：新建令牌 → 明文弹窗仅展示一次，复制后关闭即清除', async () => {
    const user = userEvent.setup()
    createTokenMutate.mockImplementation(
      (_name: string, opts?: { onSuccess?: (r: { plaintext: string; item: unknown }) => void }) => {
        opts?.onSuccess?.({ plaintext: 'serenique_plaintext123', item: token })
      },
    )
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window.navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    })

    mockHooks({ tokens: [token] })
    render(<SettingsPage />)
    tab('API 令牌').click()

    await user.click(screen.getByRole('button', { name: '新建令牌' }))
    await user.type(screen.getByLabelText('令牌名称'), 'macbook')
    await user.click(screen.getByRole('button', { name: '创建' }))

    expect(createTokenMutate).toHaveBeenCalledWith('macbook', expect.any(Object))
    // 明文弹窗出现，仅一次
    expect(await screen.findByText('serenique_plaintext123')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '复制令牌' }))
    expect(writeText).toHaveBeenCalledWith('serenique_plaintext123')

    await user.click(screen.getByRole('button', { name: '我已知晓，关闭' }))
    expect(screen.queryByText('serenique_plaintext123')).not.toBeInTheDocument()
  })

  it('令牌 tab：撤销需二次确认', async () => {
    const user = userEvent.setup()
    mockHooks({ tokens: [token] })
    render(<SettingsPage />)
    tab('API 令牌').click()

    await user.click(screen.getByRole('button', { name: '撤销令牌 macbook' }))
    expect(screen.getByText('撤销 API 令牌')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '撤销' }))
    expect(revokeTokenMutate).toHaveBeenCalledWith('t1')
  })

  it('AI 记忆 tab：回填用户画像并保存提交 PUT', async () => {
    const user = userEvent.setup()
    mockedUseAiMemory.mockReturnValue({
      data: memory,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAiMemory>)
    render(<SettingsPage />)
    await user.click(screen.getByRole('button', { name: 'AI 记忆' }))

    await user.type(screen.getByLabelText('用户画像'), '我喜欢喝美式，周末不爱被打扰')
    await user.click(screen.getByRole('button', { name: '保存' }))

    expect(updateMemoryMutate).toHaveBeenCalledWith('我喜欢喝美式，周末不爱被打扰')
  })

  it('AI 记忆 tab：超长内容禁用保存（>2048）', () => {
    mockedUseAiMemory.mockReturnValue({
      data: memory,
      isPending: false,
      isError: false,
      refetch: vi.fn(),
    } as unknown as ReturnType<typeof useAiMemory>)
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'AI 记忆' }))

    fireEvent.change(screen.getByLabelText('用户画像'), {
      target: { value: 'a'.repeat(2049) },
    })

    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('通用 tab：主题切换调用 setTheme，退出登录触发 logout', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)
    tab('通用').click()

    await user.click(screen.getByRole('button', { name: '主题' }))
    await user.click(await screen.findByText('深色'))
    expect(setTheme).toHaveBeenCalledWith('dark')

    await user.click(screen.getByRole('button', { name: '退出登录' }))
    expect(logoutMutate).toHaveBeenCalled()
  })
})

/** 点击顶部 tab（页面内唯一的 <button> 匹配）。 */
function tab(name: string) {
  const el = screen.getByRole('button', { name })
  fireEvent.click(el)
  return el
}
