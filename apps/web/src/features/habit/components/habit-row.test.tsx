import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HabitDailyEntry, HabitEntry } from '@/features/habit/api'
import { HabitRow } from './habit-row'

// vitest 4 移除了 vi.hoisted：顶层 const 会被 vi.mock 工厂直接引用（自动提升）。
const mocks = {
  setDaily: vi.fn(),
  clearDaily: vi.fn(),
  deleteHabit: vi.fn(),
  openEdit: vi.fn(),
}

vi.mock('@/features/habit/queries', () => ({
  useSetDaily: () => ({ mutate: mocks.setDaily }),
  useClearDaily: () => ({ mutate: mocks.clearDaily }),
  useDeleteHabit: () => ({ mutate: mocks.deleteHabit }),
}))

vi.mock('@/stores/habit-ui', () => ({
  useHabitUIStore: () => ({
    openEdit: mocks.openEdit,
  }),
}))

beforeEach(() => vi.clearAllMocks())

function makeHabit(overrides: Partial<HabitEntry> = {}): HabitEntry {
  return {
    id: 'h1',
    name: '跑步',
    kind: 'good',
    countable: false,
    sortOrder: 0,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
    ...overrides,
  }
}

function makeDaily(overrides: Partial<HabitDailyEntry> = {}): HabitDailyEntry {
  return {
    habitId: 'h1',
    status: 'done',
    count: 0,
    note: null,
    ...overrides,
  }
}

describe('HabitRow · 做没做型', () => {
  it('未记录时点「做了」→ setDaily(status done)', async () => {
    const user = userEvent.setup()
    render(<HabitRow habit={makeHabit()} daily={undefined} date="2026-08-16" />)
    await user.click(screen.getByRole('button', { name: /做了/ }))
    expect(mocks.setDaily).toHaveBeenCalledWith({
      habitId: 'h1',
      date: '2026-08-16',
      status: 'done',
    })
    expect(mocks.clearDaily).not.toHaveBeenCalled()
  })

  it('已做状态再点「做了」→ clearDaily（取消记录）', async () => {
    const user = userEvent.setup()
    render(<HabitRow habit={makeHabit()} daily={makeDaily({ status: 'done' })} date="2026-08-16" />)
    await user.click(screen.getByRole('button', { name: /做了/ }))
    expect(mocks.clearDaily).toHaveBeenCalledWith({ habitId: 'h1', date: '2026-08-16' })
  })

  it('已做状态点「没做」→ setDaily(status not_done)', async () => {
    const user = userEvent.setup()
    render(<HabitRow habit={makeHabit()} daily={makeDaily({ status: 'done' })} date="2026-08-16" />)
    await user.click(screen.getByRole('button', { name: /没做/ }))
    expect(mocks.setDaily).toHaveBeenCalledWith({
      habitId: 'h1',
      date: '2026-08-16',
      status: 'not_done',
    })
  })
})

describe('HabitRow · 计数型', () => {
  it('点 +1 → setDaily(count 1)，再点 +1 → count 2', async () => {
    const user = userEvent.setup()
    render(
      <HabitRow
        habit={makeHabit({ countable: true })}
        daily={makeDaily({ status: null, count: 0 })}
        date="2026-08-16"
      />,
    )
    await user.click(screen.getByRole('button', { name: '增加次数' }))
    expect(mocks.setDaily).toHaveBeenLastCalledWith({
      habitId: 'h1',
      date: '2026-08-16',
      count: 1,
    })
    await user.click(screen.getByRole('button', { name: '增加次数' }))
    expect(mocks.setDaily).toHaveBeenLastCalledWith({
      habitId: 'h1',
      date: '2026-08-16',
      count: 2,
    })
  })

  it('count=0 时 -1 禁用；count=1 时 -1 → clearDaily', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <HabitRow
        habit={makeHabit({ countable: true })}
        daily={makeDaily({ status: null, count: 0 })}
        date="2026-08-16"
      />,
    )
    expect(screen.getByRole('button', { name: '减少次数' })).toBeDisabled()

    rerender(
      <HabitRow
        habit={makeHabit({ countable: true })}
        daily={makeDaily({ status: null, count: 1 })}
        date="2026-08-16"
      />,
    )
    await user.click(screen.getByRole('button', { name: '减少次数' }))
    expect(mocks.clearDaily).toHaveBeenCalledWith({ habitId: 'h1', date: '2026-08-16' })
  })

  it('count=3 时 -1 → setDaily(count 2)', async () => {
    const user = userEvent.setup()
    render(
      <HabitRow
        habit={makeHabit({ countable: true })}
        daily={makeDaily({ status: null, count: 3 })}
        date="2026-08-16"
      />,
    )
    await user.click(screen.getByRole('button', { name: '减少次数' }))
    expect(mocks.setDaily).toHaveBeenCalledWith({
      habitId: 'h1',
      date: '2026-08-16',
      count: 2,
    })
  })
})

describe('HabitRow · 备注', () => {
  it('已有记录时保存备注带原状态一起 upsert', async () => {
    const user = userEvent.setup()
    render(<HabitRow habit={makeHabit()} daily={makeDaily({ status: 'done' })} date="2026-08-16" />)
    await user.click(screen.getByRole('button', { name: '编辑备注' }))
    await user.type(screen.getByLabelText('备注输入'), '5km')
    await user.click(screen.getByRole('button', { name: '保存备注' }))
    expect(mocks.setDaily).toHaveBeenCalledWith({
      habitId: 'h1',
      date: '2026-08-16',
      status: 'done',
      count: undefined,
      note: '5km',
    })
  })

  it('无记录且备注非空 → 仅传 note（Enter 保存）', async () => {
    const user = userEvent.setup()
    render(<HabitRow habit={makeHabit()} daily={undefined} date="2026-08-16" />)
    await user.click(screen.getByRole('button', { name: '编辑备注' }))
    await user.type(screen.getByLabelText('备注输入'), '晨跑{Enter}')
    expect(mocks.setDaily).toHaveBeenCalledWith({
      habitId: 'h1',
      date: '2026-08-16',
      note: '晨跑',
    })
  })

  it('已有记录清空备注 → note: null 清除', async () => {
    const user = userEvent.setup()
    render(
      <HabitRow
        habit={makeHabit()}
        daily={makeDaily({ status: 'not_done', note: '旧备注' })}
        date="2026-08-16"
      />,
    )
    await user.click(screen.getByRole('button', { name: '编辑备注' }))
    const input = screen.getByLabelText('备注输入')
    await user.clear(input)
    await user.click(screen.getByRole('button', { name: '保存备注' }))
    expect(mocks.setDaily).toHaveBeenCalledWith({
      habitId: 'h1',
      date: '2026-08-16',
      status: 'not_done',
      count: undefined,
      note: null,
    })
  })
})

describe('HabitRow · 管理菜单', () => {
  it('编辑打开编辑弹窗（store openEdit）', async () => {
    const user = userEvent.setup()
    render(<HabitRow habit={makeHabit()} daily={undefined} date="2026-08-16" />)
    await user.click(screen.getByRole('button', { name: '习惯操作' }))
    await user.click(await screen.findByText('编辑习惯'))
    expect(mocks.openEdit).toHaveBeenCalled()
  })

  it('删除需确认，确认后调 deleteHabit', async () => {
    const user = userEvent.setup()
    render(<HabitRow habit={makeHabit()} daily={undefined} date="2026-08-16" />)
    await user.click(screen.getByRole('button', { name: '习惯操作' }))
    await user.click(await screen.findByText('删除习惯'))
    expect(screen.getByText(/不可恢复/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '删除' }))
    expect(mocks.deleteHabit).toHaveBeenCalledWith('h1')
  })
})
