import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiWsUrl } from './ws-url'

// 用 vi.hoisted 控制 env.apiBaseUrl（ws-url 在调用时读取 env）。
const { envMock } = vi.hoisted(() => ({ envMock: { apiBaseUrl: '' } }))
vi.mock('@/config/env', () => ({ env: envMock }))

describe('apiWsUrl', () => {
  afterEach(() => {
    envMock.apiBaseUrl = ''
  })

  it('未配置 apiBaseUrl 时从当前 origin 派生 ws 地址', () => {
    expect(apiWsUrl()).toBe(window.location.origin.replace(/^http/, 'ws') + '/api/ai/ws')
  })

  it('http apiBaseUrl → ws，且作为唯一 origin 来源', () => {
    envMock.apiBaseUrl = 'http://api.example.com'
    expect(apiWsUrl()).toBe('ws://api.example.com/api/ai/ws')
  })

  it('https apiBaseUrl → wss', () => {
    envMock.apiBaseUrl = 'https://api.example.com'
    expect(apiWsUrl()).toBe('wss://api.example.com/api/ai/ws')
  })

  it('apiBaseUrl 末尾斜杠被归一化', () => {
    envMock.apiBaseUrl = 'http://api.example.com/'
    expect(apiWsUrl()).toBe('ws://api.example.com/api/ai/ws')
  })

  it('支持自定义 path（无前导斜杠时自动补齐）', () => {
    envMock.apiBaseUrl = 'http://api.example.com'
    expect(apiWsUrl('/custom/ws')).toBe('ws://api.example.com/custom/ws')
    expect(apiWsUrl('custom/ws')).toBe('ws://api.example.com/custom/ws')
  })
})
