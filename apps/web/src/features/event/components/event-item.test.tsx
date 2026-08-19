import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EventEntry } from '@/features/event/api'
import { EventItem } from './event-item'

const { deleteEvent, onEdit } = vi.hoisted(() => ({
  deleteEvent: vi.fn(),
  onEdit: vi.fn(),
}))

vi.mock('@/features/event/queries', () => ({
  useDeleteEvent: () => ({ mutate: deleteEvent }),
}))

function renderItem(event: EventEntry) {
  return render(<EventItem event={event} onEdit={onEdit} />)
}

function makeEvent(overrides: Partial<EventEntry> = {}): EventEntry {
  return {
    id: 'ev1',
    title: '晨会',
    startAt: new Date(2026, 7, 6, 9, 0).toISOString(),
    endAt: new Date(2026, 7, 6, 10, 0).toISOString(),
    isAllDay: false,
    location: null,
    note: null,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

beforeEach(() => vi.clearAllMocks())

describe('EventItem', () => {
  it('时段事件显示 HH:mm – HH:mm 与标题', () => {
    renderItem(makeEvent())
    expect(screen.getByText('09:00 – 10:00')).toBeInTheDocument()
    expect(screen.getByText('晨会')).toBeInTheDocument()
  })

  it('全天事件显示「全天」徽标而非时间段', () => {
    renderItem(makeEvent({ isAllDay: true }))
    expect(screen.getByText('全天')).toBeInTheDocument()
    expect(screen.queryByText('09:00 – 10:00')).not.toBeInTheDocument()
  })

  it('有地点时显示地点', () => {
    renderItem(makeEvent({ location: '会议室 A' }))
    expect(screen.getByText('会议室 A')).toBeInTheDocument()
  })

  it('超长备注默认截断，可展开/收起', async () => {
    const user = userEvent.setup()
    renderItem(makeEvent({ note: '长'.repeat(200) }))
    expect(screen.getByText('展开')).toBeInTheDocument()
    await user.click(screen.getByText('展开'))
    expect(screen.getByText('收起')).toBeInTheDocument()
  })

  it('点「编辑」调用 onEdit(event)', async () => {
    const user = userEvent.setup()
    const event = makeEvent()
    renderItem(event)
    await user.click(screen.getByLabelText('日历操作'))
    // base-ui 菜单项在 portal 中异步渲染，用 findByText 等待。
    await user.click(await screen.findByText('编辑'))
    expect(onEdit).toHaveBeenCalledWith(event)
  })

  it('点「删除」确认后调用 deleteEvent(id)', async () => {
    const user = userEvent.setup()
    renderItem(makeEvent())
    await user.click(screen.getByLabelText('日历操作'))
    await user.click(await screen.findByText('删除'))
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(deleteEvent).toHaveBeenCalledWith('ev1')
  })
})
