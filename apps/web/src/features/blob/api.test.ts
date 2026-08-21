import { afterEach, describe, expect, it, vi } from 'vitest'
import { api } from '@/api/client'
import { deleteBlob, listBlobAttachments, listBlobs, uploadBlob } from './api'

vi.mock('@/api/client', () => ({
  api: { post: vi.fn(), get: vi.fn(), delete: vi.fn() },
  apiUrl: (path: string) => `/api/${path.replace(/^\/+/, '')}`,
}))

const mockedPost = vi.mocked(api.post)
const mockedGet = vi.mocked(api.get)
const mockedDelete = vi.mocked(api.delete)

const entry = {
  id: 'b1',
  originalName: 'a.png',
  mimeType: 'image/png',
  size: 3,
  checksum: 'x',
  metadata: {},
  width: null as null,
  height: null as null,
  duration: null as null,
  createdAt: '2026-08-05T00:00:00.000Z',
  refCount: 0,
}
const wrap = (data: unknown, status = 200) =>
  new Response(JSON.stringify({ success: true, message: 'ok', data }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

const cred = {
  blobId: 'u1',
  storagePath: 'image/2026/08/u1.png',
  method: 'PUT' as const,
  url: 'https://s3.0icey.icu/image/2026/08/u1.png?e=1&s=abc',
  expires: 1,
  expiresAt: 'x',
  mode: 'direct-r2' as const,
}

describe('uploadBlob', () => {
  afterEach(() => {
    vi.clearAllMocks()
    vi.unstubAllGlobals()
  })

  it('r2 直传：upload-url → PUT 网关 → confirm（SHA-256 校验）', async () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' })
    const put = vi.fn().mockResolvedValue(new Response('OK', { status: 200 }))
    vi.stubGlobal('fetch', put)

    mockedPost.mockResolvedValueOnce(wrap(cred)).mockResolvedValueOnce(wrap(entry))

    const result = await uploadBlob(file)

    expect(result.id).toBe('b1')
    // PUT 直连网关（白名单域名）
    expect(put).toHaveBeenCalledTimes(1)
    const [putUrl, putOpts] = put.mock.calls[0] as [URL, RequestInit]
    expect(putUrl.origin).toBe('https://s3.0icey.icu')
    expect(putOpts.method).toBe('PUT')
    // confirm：blobId + SHA-256('abc') checksum
    expect(mockedPost).toHaveBeenCalledTimes(2)
    const [, confOpts] = mockedPost.mock.calls[1] as [string, { json?: unknown }]
    const body = confOpts.json as {
      blobId: string
      checksum: string
      storagePath: string
    }
    expect(body.blobId).toBe('u1')
    expect(body.storagePath).toBe('image/2026/08/u1.png')
    expect(body.checksum).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('upload-url 返回 400（local 后端）→ 回退 multipart', async () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' })
    mockedPost.mockRejectedValueOnce(Object.assign(new Error('bad'), { status: 400 }))
    mockedPost.mockResolvedValueOnce(wrap(entry))

    const result = await uploadBlob(file)

    expect(result.id).toBe('b1')
    expect(mockedPost).toHaveBeenCalledTimes(2)
    const [url] = mockedPost.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/blobs/upload')
  })

  it('PUT 失败时抛出（不静默回退 multipart）', async () => {
    const file = new File(['abc'], 'a.png', { type: 'image/png' })
    mockedPost.mockResolvedValueOnce(wrap(cred))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Forbidden', { status: 403 })))

    await expect(uploadBlob(file)).rejects.toThrow('直传失败')
  })
})

describe('listBlobs', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('拼接 mimeType 前缀过滤并解包分页结果', async () => {
    mockedGet.mockResolvedValueOnce(wrap({ items: [entry], total: 1 }))

    const result = await listBlobs({ page: 2, pageSize: 48, mimeType: 'image/' })

    expect(mockedGet).toHaveBeenCalledWith('/api/blobs', {
      searchParams: { page: '2', pageSize: '48', mimeType: 'image/' },
    })
    expect(result.items[0].id).toBe('b1')
    expect(result.total).toBe(1)
  })

  it('不传 mimeType 时省略该参数', async () => {
    mockedGet.mockResolvedValueOnce(wrap({ items: [], total: 0 }))

    await listBlobs({ page: 1, pageSize: 20 })

    expect(mockedGet).toHaveBeenCalledWith('/api/blobs', {
      searchParams: { page: '1', pageSize: '20' },
    })
  })
})

describe('deleteBlob', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('DELETE /blobs/:id 解包成功', async () => {
    mockedDelete.mockResolvedValueOnce(wrap(null))

    await expect(deleteBlob('b1')).resolves.toBeUndefined()

    expect(mockedDelete).toHaveBeenCalledWith('/api/blobs/b1')
  })
})

describe('listBlobAttachments', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('GET /blobs/:id/attachments 返回引用列表', async () => {
    mockedGet.mockResolvedValueOnce(
      wrap([
        {
          id: 'a1',
          blobId: 'b1',
          ownerType: 'moment',
          ownerId: 'm1',
          role: 'attachment',
          displayName: null,
          sortOrder: 0,
          createdAt: '2026-08-05T00:00:00.000Z',
        },
      ]),
    )

    const refs = await listBlobAttachments('b1')

    expect(mockedGet).toHaveBeenCalledWith('/api/blobs/b1/attachments')
    expect(refs[0].ownerType).toBe('moment')
  })
})
