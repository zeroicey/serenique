import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { MomentCreateAttachmentGrid } from './moment-create-attachment-grid'

describe('MomentCreateAttachmentGrid', () => {
  it('选择文件后加入列表并可移除', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { container } = render(<MomentCreateAttachmentGrid mediaFiles={[]} onChange={onChange} />)

    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const file = new File(['x'], 'a.png', { type: 'image/png' })
    await user.upload(input, file)

    expect(onChange).toHaveBeenCalledTimes(1)
    const files = onChange.mock.calls[0][0] as { name: string; file?: File }[]
    expect(files[0].name).toBe('a.png')
    expect(files[0].file).toBeInstanceOf(File)
  })
})
