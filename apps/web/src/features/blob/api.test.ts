import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { uploadBlob } from './api'

vi.mock('@/api/client', () => ({
  api: { post: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
}))

const mockedPost = vi.mocked(api.post)

// 断言 uploadBlob 以正确的 URL 与 multipart body 调用 api.post，并解包响应。
describe('uploadBlob', () => {
  afterEach(() => vi.clearAllMocks())

  it('以 multipart 上传文件并解包 BlobEntry', async () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' })
    const envelope = {
      success: true,
      message: '上传成功',
      data: {
        id: 'b1',
        originalName: 'a.png',
        mimeType: 'image/png',
        size: 3,
        checksum: 'x',
        metadata: {},
        width: null,
        height: null,
        duration: null,
        createdAt: '2026-08-05T00:00:00.000Z',
      },
    }
    mockedPost.mockResolvedValue(
      new Response(JSON.stringify(envelope), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )

    const result = await uploadBlob(file)

    expect(result.id).toBe('b1')
    expect(mockedPost).toHaveBeenCalledTimes(1)
    const [url, opts] = mockedPost.mock.calls[0]
    expect(url).toBe('/api/blobs/upload')
    expect(opts?.body).toBeInstanceOf(FormData)
    const form = opts?.body as FormData
    expect((form.get('file') as File).name).toBe('a.png')
  })
})
