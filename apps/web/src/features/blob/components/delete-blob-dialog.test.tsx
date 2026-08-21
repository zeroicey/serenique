import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { BlobEntry } from '@/features/blob/api'
import { DeleteBlobDialog } from './delete-blob-dialog'

const mocks = {
  refs: vi.fn(),
  delete: vi.fn((_id: string, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
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

  it('引用加载中：确认按钮禁用', async () => {
    mocks.refs.mockReturnValue({ data: undefined, isLoading: true })
    render(<DeleteBlobDialog blob={makeBlob(1)} onClose={vi.fn()} />)

    const confirm = await screen.findByRole('button', { name: /确认删除/ })
    expect(confirm).toBeDisabled()
  })
})
