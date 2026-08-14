import { describe, expect, it } from 'vitest'
import type { TaskEntry } from './api'
import { sortTasks, taskStatusLabel } from './lib'

describe('taskStatusLabel', () => {
  it('映射三种状态到中文标签', () => {
    expect(taskStatusLabel('todo')).toBe('待办')
    expect(taskStatusLabel('done')).toBe('已完成')
    expect(taskStatusLabel('abandon')).toBe('已放弃')
  })
})

describe('sortTasks', () => {
  function make(id: string, status: TaskEntry['status']): TaskEntry {
    return {
      id,
      groupId: 'g1',
      title: `任务 ${id}`,
      status,
      createdAt: '2026-08-05T00:00:00.000Z',
      updatedAt: '2026-08-05T00:00:00.000Z',
      completedAt: null,
    }
  }

  it('待办在前，已完成次之，已放弃最后', () => {
    const input = [make('a', 'done'), make('b', 'abandon'), make('c', 'todo')]
    expect(sortTasks(input).map((t) => t.status)).toEqual(['todo', 'done', 'abandon'])
  })

  it('同状态保持原顺序（稳定排序）', () => {
    const input = [make('a', 'todo'), make('b', 'todo')]
    expect(sortTasks(input).map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('不修改原数组', () => {
    const input = [make('a', 'done'), make('b', 'todo')]
    sortTasks(input)
    expect(input.map((t) => t.status)).toEqual(['done', 'todo'])
  })
})
