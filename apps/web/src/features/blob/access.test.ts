import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, resolveApiPath } from '@/api/client'
import { createBlobAccessLink } from './access'

vi.mock('@/api/client', () => ({
  api: { post: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
  resolveApiPath: (path: string) => `https://api.example.com${path}`,
}))

const mockedPost = vi.mocked(api.post)

describe('createBlobAccessLink', () => {
  afterEach(() => vi.clearAllMocks())

  it('posts to access-link and returns an absolute signed URL', async () => {
    mockedPost.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: 'ok',
          data: {
            path: '/api/blobs/b1/file?expires=9999999999&signature=sig',
            expires: 9999999999,
            signature: 'sig',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const url = await createBlobAccessLink('b1')
    expect(mockedPost).toHaveBeenCalledWith('/api/blobs/b1/access-link', {
      json: { expiresInSeconds: 3600 },
    })
    expect(url).toBe('https://api.example.com/api/blobs/b1/file?expires=9999999999&signature=sig')
  })

  it('resolveApiPath builds an absolute URL from a relative path', () => {
    expect(resolveApiPath('/api/blobs/b1/file')).toBe('https://api.example.com/api/blobs/b1/file')
  })

  it('thumb 链接请求携带 kind=thumb 并复用独立缓存', async () => {
    mockedPost.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          message: 'ok',
          data: {
            path: '/api/blobs/b1/file?thumbnail=1&expires=9999999999&signature=sig',
            expires: 9999999999,
            signature: 'sig',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    const url = await createBlobAccessLink('b1', 'thumb')
    expect(mockedPost).toHaveBeenCalledWith('/api/blobs/b1/access-link', {
      json: { expiresInSeconds: 3600, kind: 'thumb' },
    })
    expect(url).toBe(
      'https://api.example.com/api/blobs/b1/file?thumbnail=1&expires=9999999999&signature=sig',
    )
  })
})
