import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { MediaFile } from '@/types/media'
import { MediaPreviewDialog } from './media-preview-dialog'

const files: MediaFile[] = [
  { id: '1', name: 'a.png', type: 'image/png', url: '/file/a' },
  { id: '2', name: 'b.mp4', type: 'video/mp4', url: '/file/b' },
]

describe('MediaPreviewDialog', () => {
  it('显示当前索引与计数，下一张可导航', async () => {
    const user = userEvent.setup()
    const onNavigate = vi.fn()
    render(
      <MediaPreviewDialog
        open
        mediaFiles={files}
        currentIndex={0}
        onClose={vi.fn()}
        onNavigate={onNavigate}
      />,
    )
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '下一张' }))
    expect(onNavigate).toHaveBeenCalledWith(1)
  })

  it('第一张时上一张按钮禁用', () => {
    render(
      <MediaPreviewDialog
        open
        mediaFiles={files}
        currentIndex={0}
        onClose={vi.fn()}
        onNavigate={vi.fn()}
      />,
    )
    expect(screen.getByRole('button', { name: '上一张' })).toBeDisabled()
  })
})
