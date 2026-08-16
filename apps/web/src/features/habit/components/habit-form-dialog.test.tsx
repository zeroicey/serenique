import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HabitEntry } from '@/features/habit/api'
import { HabitFormDialog } from './habit-form-dialog'

// vitest 4 移除了 vi.hoisted：顶层 const 会被 vi.mock 工厂直接引用（自动提升）。
// mutation 的 mutate(input, options) 需要触发 onSuccess，组件里 close() 才会被调用。
const mocks = {
  create: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  update: vi.fn((_input: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.()),
  close: vi.fn(),
}

let store: {
  createOpen: boolean
  editingHabit: HabitEntry | null
  close: ReturnType<typeof vi.fn>
}

vi.mock('@/stores/habit-ui', () => ({
  useHabitUIStore: () => store,
}))

vi.mock('@/features/habit/queries', () => ({
  useCreateHabit: () => ({ mutate: mocks.create, isPending: false }),
  useUpdateHabit: () => ({ mutate: mocks.update, isPending: false }),
}))

function makeHabit(): HabitEntry {
  return {
    id: 'h1',
    name: '跑步',
    description: null,
    kind: 'good',
    countable: false,
    sortOrder: 2,
    createdAt: '2026-08-05T00:00:00.000Z',
    updatedAt: '2026-08-05T00:00:00.000Z',
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  store = { createOpen: true, editingHabit: null, close: mocks.close }
})

describe('HabitFormDialog · 新建', () => {
  it('默认好事 + 非计数；填写后提交 createHabit', async () => {
    const user = userEvent.setup()
    render(<HabitFormDialog />)
    await user.type(screen.getByLabelText('名称'), '喝水')
    await user.click(screen.getByRole('button', { name: '坏事' }))
    await user.click(screen.getByLabelText('可计数'))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.create).toHaveBeenCalledTimes(1)
    expect(mocks.create.mock.calls[0][0]).toEqual({
      name: '喝水',
      kind: 'bad',
      countable: true,
    })
    expect(mocks.close).toHaveBeenCalled()
  })

  it('新建提交不携带 sortOrder（契约仅 name/kind/countable）', async () => {
    const user = userEvent.setup()
    render(<HabitFormDialog />)
    await user.type(screen.getByLabelText('名称'), '读书')
    await user.type(screen.getByLabelText('排序号（越小越靠前）'), '3')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.create.mock.calls[0][0]).toEqual({ name: '读书', kind: 'good', countable: false })
  })

  it('名称为空时不提交并显示错误', async () => {
    const user = userEvent.setup()
    render(<HabitFormDialog />)
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(screen.getByText('名称不能为空')).toBeInTheDocument()
    expect(mocks.create).not.toHaveBeenCalled()
  })

  it('填写简介时随 createHabit 提交（空简介省略）', async () => {
    const user = userEvent.setup()
    render(<HabitFormDialog />)
    await user.type(screen.getByLabelText('名称'), '跑步')
    await user.type(screen.getByLabelText('简介（可选）'), '每天晨跑 5 公里')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.create.mock.calls[0][0]).toEqual({
      name: '跑步',
      kind: 'good',
      countable: false,
      description: '每天晨跑 5 公里',
    })
  })
})

describe('HabitFormDialog · 编辑', () => {
  it('回填并提交 updateHabit（含 sortOrder）', async () => {
    const user = userEvent.setup()
    store.editingHabit = makeHabit()
    render(<HabitFormDialog />)
    expect(screen.getByLabelText('名称')).toHaveValue('跑步')
    expect(screen.getByLabelText('排序号（越小越靠前）')).toHaveValue('2')
    await user.clear(screen.getByLabelText('排序号（越小越靠前）'))
    await user.type(screen.getByLabelText('排序号（越小越靠前）'), '5')
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.update).toHaveBeenCalledTimes(1)
    expect(mocks.update.mock.calls[0][0]).toEqual({
      id: 'h1',
      name: '跑步',
      kind: 'good',
      countable: false,
      sortOrder: 5,
      description: null,
    })
    expect(mocks.close).toHaveBeenCalled()
  })

  it('排序号留空时 updateHabit 不带 sortOrder', async () => {
    const user = userEvent.setup()
    store.editingHabit = makeHabit()
    render(<HabitFormDialog />)
    await user.clear(screen.getByLabelText('排序号（越小越靠前）'))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.update.mock.calls[0][0]).toEqual({
      id: 'h1',
      name: '跑步',
      kind: 'good',
      countable: false,
      sortOrder: undefined,
      description: null,
    })
  })

  it('编辑回填简介，清空时提交 null 清除', async () => {
    const user = userEvent.setup()
    store.editingHabit = makeHabit()
    store.editingHabit = { ...makeHabit(), description: '旧简介' }
    render(<HabitFormDialog />)
    expect(screen.getByLabelText('简介（可选）')).toHaveValue('旧简介')
    await user.clear(screen.getByLabelText('简介（可选）'))
    await user.click(screen.getByRole('button', { name: '保存' }))
    expect(mocks.update.mock.calls[0][0]).toEqual({
      id: 'h1',
      name: '跑步',
      kind: 'good',
      countable: false,
      sortOrder: 2,
      description: null,
    })
  })
})
