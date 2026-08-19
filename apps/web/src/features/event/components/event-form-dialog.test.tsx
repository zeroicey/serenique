import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEntry } from '@/features/event/api'
import { EventFormDialog } from './event-form-dialog'

// mutation 的 mutate(input, options) 需要触发 onSuccess，组件里 onClose() 才会被调用。
const mocks = vi.hoisted(() => ({
  create: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  update: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  close: vi.fn(),
}))

vi.mock('@/features/event/queries', () => ({
  useCreateEvent: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateEvent: () => ({ mutate: mocks.update, isPending: false }),
}))

function makeEvent(): EventEntry {
  return {
    id: 'ev1',
    title: '产品评审',
    startAt: new Date(2026, 7, 6, 14, 0).toISOString(),
    endAt: new Date(2026, 7, 6, 15, 0).toISOString(),
    isAllDay: false,
    location: '会议室 A',
    note: '带笔记本',
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

interface RenderDialogOptions {
  editing?: EventEntry | null
  viewedDate?: string
}

function renderDialog({ editing = null, viewedDate = '2026-08-06' }: RenderDialogOptions = {}) {
  return render(
    <EventFormDialog open editing={editing} viewedDate={viewedDate} onClose={mocks.close} />,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('EventFormDialog', () => {
  it('新建态默认取查看日期 09:00–10:00，提交调 createEvent', async () => {
    const user = userEvent.setup()
    renderDialog()
    expect(screen.getByLabelText('开始')).toHaveValue('2026-08-06T09:00')
    expect(screen.getByLabelText('结束')).toHaveValue('2026-08-06T10:00')
    await user.type(screen.getByLabelText('标题'), '晨会')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0][0]).toEqual({
      title: '晨会',
      startAt: new Date(2026, 7, 6, 9, 0).toISOString(),
      endAt: new Date(2026, 7, 6, 10, 0).toISOString(),
      isAllDay: false,
      location: undefined,
      note: undefined,
    })
    expect(mocks.close).toHaveBeenCalled()
  })

  it('编辑态回填标题与本地时间，提交调 updateEvent', async () => {
    const user = userEvent.setup()
    renderDialog({ editing: makeEvent() })
    expect(screen.getByLabelText('标题')).toHaveValue('产品评审')
    expect(screen.getByLabelText('开始')).toHaveValue('2026-08-06T14:00')
    expect(screen.getByLabelText('结束')).toHaveValue('2026-08-06T15:00')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls[0][0]).toEqual({
      id: 'ev1',
      title: '产品评审',
      startAt: new Date(2026, 7, 6, 14, 0).toISOString(),
      endAt: new Date(2026, 7, 6, 15, 0).toISOString(),
      isAllDay: false,
      location: '会议室 A',
      note: '带笔记本',
    })
    expect(mocks.close).toHaveBeenCalled()
  })

  it('勾选全天后显示日期输入，提交用 00:00–23:59', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByLabelText('全天'))
    const dateInput = screen.getByLabelText('日期')
    fireEvent.change(dateInput, { target: { value: '2026-08-06' } })
    await user.type(screen.getByLabelText('标题'), '出差')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0][0]).toEqual({
      title: '出差',
      startAt: new Date(2026, 7, 6, 0, 0).toISOString(),
      endAt: new Date(2026, 7, 6, 23, 59).toISOString(),
      isAllDay: true,
      location: undefined,
      note: undefined,
    })
  })

  it('结束时间早于开始时间时不提交并显示错误', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.type(screen.getByLabelText('标题'), '晨会')
    fireEvent.change(screen.getByLabelText('开始'), { target: { value: '2026-08-06T10:00' } })
    fireEvent.change(screen.getByLabelText('结束'), { target: { value: '2026-08-06T09:00' } })
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByText('结束时间必须晚于开始时间')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })
})
