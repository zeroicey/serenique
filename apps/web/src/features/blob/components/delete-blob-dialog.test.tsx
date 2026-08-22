import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlobEntry } from '@/features/blob/api'
import { DeleteBlobDialog } from './delete-blob-dialog'

const mocks = {
  refs: vi.fn(),
  delete: vi.fn(
    (_id: string, opts?: { onSuccess?: (r: { deleted: boolean; deleteUrls: string[] }) => void }) =>
      opts?.onSuccess?.({ deleted: true, deleteUrls: [] }),
  ),
}

vi.mock('@/features/blob/queries', () => ({
  useBlobAttachments: (blobId: string | null) => mocks.refs(blobId),
  useDeleteBlob: () => ({ mutate: mocks.delete, isPending: false }),
}))

function makeBlob(refCount = 0): BlobEntry {
  return {
    id: 'b1',
    originalName: 'a.png',
    mimeType: 'image/png',
    size: 3,
    checksum: 'x',
    metadata: {},
    width: 10,
    height: 10,
    duration: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    refCount,
  }
}

const refsMoment = [
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
]

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DeleteBlobDialog', () => {
  it('打开时懒查引用（传入 blobId）', async () => {
    mocks.refs.mockReturnValue({ data: refsMoment, isLoading: false })
    render(<DeleteBlobDialog blob={makeBlob(1)} onClose={vi.fn()} />)
    expect(mocks.refs).toHaveBeenCalledWith('b1')
    expect(await screen.findByText(/无法删除/)).toBeTruthy()
  })

  it('有引用：列出引用方 + 确认按钮禁用', async () => {
    mocks.refs.mockReturnValue({ data: refsMoment, isLoading: false })
    render(<DeleteBlobDialog blob={makeBlob(1)} onClose={vi.fn()} />)

    // 引用方中文标签（闪记 × 1）
    expect(await screen.findByText(/闪记 × 1/)).toBeTruthy()
    const confirm = screen.getByRole('button', { name: /确认删除/ })
    expect(confirm).toBeDisabled()
  })

  it('无引用：确认删除调用 mutation 并关闭', async () => {
    mocks.refs.mockReturnValue({ data: [], isLoading: false })
    const onClose = vi.fn()
    render(<DeleteBlobDialog blob={makeBlob(0)} onClose={onClose} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /确认删除/ })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /确认删除/ }))

    expect(mocks.delete).toHaveBeenCalledWith('b1', expect.anything())
    expect(onClose).toHaveBeenCalled()
  })

  it('r2 deleteUrls：成功后直发网关 DELETE（仅官方域名，fire-and-forget）', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(null, { status: 200 }))
    mocks.refs.mockReturnValue({ data: [], isLoading: false })
    mocks.delete.mockImplementation(
      (
        _id: string,
        opts?: { onSuccess?: (r: { deleted: boolean; deleteUrls: string[] }) => void },
      ) =>
        opts?.onSuccess?.({
          deleted: true,
          deleteUrls: [
            'https://s3.0icey.icu/image/2026/08/x.png?e=1&s=abc',
            'https://evil.example/path', // 非官方域名 → 忽略
          ],
        }),
    )
    const onClose = vi.fn()
    render(<DeleteBlobDialog blob={makeBlob(0)} onClose={onClose} />)

    await waitFor(() => expect(screen.getByRole('button', { name: /确认删除/ })).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: /确认删除/ }))

    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(fetchSpy.mock.calls[0][0]).toMatchObject({ origin: 'https://s3.0icey.icu' })
    expect(fetchSpy.mock.calls[0][1]).toMatchObject({ method: 'DELETE' })
    expect(onClose).toHaveBeenCalled()
    fetchSpy.mockRestore()
  })

  it('引用加载中：确认按钮禁用', async () => {
    mocks.refs.mockReturnValue({ data: undefined, isLoading: true })
    render(<DeleteBlobDialog blob={makeBlob(1)} onClose={vi.fn()} />)

    const confirm = await screen.findByRole('button', { name: /确认删除/ })
    expect(confirm).toBeDisabled()
  })
})
